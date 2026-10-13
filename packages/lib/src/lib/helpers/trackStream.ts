import FaxiosError from "../core/FaxiosError.js";
import utils from "../utils.js";

type ReadableStreamController = {
  close: () => void;
  enqueue: (chunk: Uint8Array) => void;
};

type ReadableStreamSource = {
  cancel?: (reason?: unknown) => Promise<unknown>;
  pull?: (controller: ReadableStreamController) => Promise<void>;
};

type ReadableStreamInit = {
  highWaterMark?: number;
};

type ReadableStreamCtor = new (source: ReadableStreamSource, init?: ReadableStreamInit) => unknown;

const ReadableStreamGlobal = (globalThis as Record<string, unknown>)["ReadableStream"] as ReadableStreamCtor | undefined;

const textEncoder = typeof TextEncoder === "function" ? new TextEncoder() : undefined;

// View the chunk's bytes without copying them. Strings are UTF-8 encoded; anything else is not
// a byte chunk and is rejected rather than silently converted.
const toBytes = (chunk: unknown): Uint8Array => {
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  if (utils.isArrayBufferView(chunk)) {
    const view = chunk as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (utils.isArrayBuffer(chunk)) {
    return new Uint8Array(chunk as ArrayBuffer);
  }
  if (utils.isString(chunk) && textEncoder) {
    return textEncoder.encode(chunk as string);
  }
  throw new FaxiosError(
    "Stream chunk must be a Uint8Array, another ArrayBufferView, an ArrayBuffer or a string, got " + utils.kindOf(chunk),
    FaxiosError.ERR_BAD_REQUEST
  );
};

const streamChunk = function* (chunk: Uint8Array, chunkSize?: number): Generator<Uint8Array> {
  const len = chunk.byteLength;

  if (!chunkSize || len < chunkSize) {
    yield chunk;
    return;
  }

  let pos = 0;
  let end: number;

  while (pos < len) {
    end = pos + chunkSize;
    yield chunk.subarray(pos, end);
    pos = end;
  }
};

type Source = {
  // Cancels the source and releases it; a read in flight settles as done.
  close: (reason?: unknown) => Promise<unknown>;
  read: () => Promise<IteratorResult<unknown>>;
};

type ReaderLike = {
  cancel: (reason?: unknown) => Promise<void>;
  read: () => Promise<IteratorResult<unknown>>;
  releaseLock: () => void;
};

type StreamLike = {
  [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
  getReader?: () => ReaderLike;
};

// Prefer a reader: cancelling it settles a pending read() at once, while an async iterator's
// return() waits behind a pending next(), so a stalled source could never be cancelled.
const openSource = (stream: unknown): Source => {
  const s = stream as StreamLike;
  if (s.getReader) {
    const reader = s.getReader();
    return {
      async close(reason) {
        try {
          await reader.cancel(reason);
        }
        finally {
          reader.releaseLock();
        }
      },
      read: () => reader.read(),
    };
  }

  const iterator = s[Symbol.asyncIterator]!();
  return {
    close: async () => iterator.return?.(),
    read: () => iterator.next(),
  };
};

const readBytes = async function* (source: Source, chunkSize?: number): AsyncGenerator<Uint8Array> {
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await source.read();
    if (done) {
      return;
    }
    yield* streamChunk(toBytes(value), chunkSize);
  }
};

export const trackStream = (stream: unknown, chunkSize: number | undefined, onProgress?: ((bytes: number) => void) | null, onFinish?: ((err?: unknown) => void) | null): unknown => {
  const source = openSource(stream);
  const iterator = readBytes(source, chunkSize);

  let bytes = 0;
  let done = false;
  const _onFinish = (e?: unknown): void => {
    if (!done) {
      done = true;
      onFinish && onFinish(e);
    }
  };

  return new ReadableStreamGlobal!(
    {
      async pull(controller: ReadableStreamController) {
        try {
          const { done: iterDone, value } = await iterator.next();
          // Cancelled while this read was pending: the stream is already closed.
          if (done) {
            return;
          }

          if (iterDone) {
            await source.close();
            _onFinish();
            controller.close();
            return;
          }

          const len = value.byteLength;
          if (onProgress) {
            const loadedBytes = (bytes += len);
            onProgress(loadedBytes);
          }
          controller.enqueue(value);
        }
        catch (err) {
          // Cancel the source so its lock and connection are released. The original error wins
          // over a failure to cancel.
          await source.close(err).catch(() => {});
          await iterator.return(undefined);
          _onFinish(err);
          throw err;
        }
      },
      async cancel(reason?: unknown) {
        _onFinish(reason);
        // Cancelling the source settles a pending read, so the generator can then finish.
        await source.close(reason);
        await iterator.return(undefined);
      },
    },
    {
      highWaterMark: 2,
    }
  );
};
