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

const readBytes = async function* (iterable: unknown, chunkSize?: number): AsyncGenerator<Uint8Array> {
  for await (const chunk of readStream(iterable)) {
    yield* streamChunk(toBytes(chunk), chunkSize);
  }
};

type ReaderLike = {
  cancel: () => Promise<void>;
  read: () => Promise<{ done: boolean; value: unknown; }>;
};

type StreamLike = {
  [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
  getReader?: () => ReaderLike;
};

const readStream = async function* (stream: unknown): AsyncGenerator<unknown> {
  const s = stream as StreamLike;
  if (s[Symbol.asyncIterator]) {
    yield* s as AsyncIterable<unknown>;
    return;
  }

  const reader = s.getReader!();
  try {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      yield value;
    }
  }
  finally {
    await reader.cancel();
  }
};

export const trackStream = (stream: unknown, chunkSize: number | undefined, onProgress?: ((bytes: number) => void) | null, onFinish?: ((err?: unknown) => void) | null): unknown => {
  const iterator = readBytes(stream, chunkSize);

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

          if (iterDone) {
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
          _onFinish(err);
          throw err;
        }
      },
      async cancel(reason?: unknown) {
        _onFinish(reason);
        return iterator.return(undefined);
      },
    },
    {
      highWaterMark: 2,
    }
  );
};
