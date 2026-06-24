type ReadableStreamController = {
  enqueue: (chunk: Uint8Array) => void;
  close: () => void;
};

type ReadableStreamSource = {
  pull?: (controller: ReadableStreamController) => Promise<void>;
  cancel?: (reason?: unknown) => Promise<unknown>;
};

type ReadableStreamInit = {
  highWaterMark?: number;
};

type ReadableStreamCtor = new (source: ReadableStreamSource, init?: ReadableStreamInit) => unknown;

const ReadableStreamGlobal = (globalThis as Record<string, unknown>)["ReadableStream"] as ReadableStreamCtor | undefined;

type ByteChunk = { byteLength: number; slice: (start: number, end?: number) => ByteChunk; };

const streamChunk = function* (chunk: ByteChunk, chunkSize?: number): Generator<ByteChunk> {
  const len = chunk.byteLength;

  if (!chunkSize || len < chunkSize) {
    yield chunk;
    return;
  }

  let pos = 0;
  let end: number;

  while (pos < len) {
    end = pos + chunkSize;
    yield chunk.slice(pos, end);
    pos = end;
  }
};

const readBytes = async function* (iterable: AsyncIterable<ByteChunk> | unknown, chunkSize?: number): AsyncGenerator<ByteChunk> {
  for await (const chunk of readStream(iterable)) {
    yield* streamChunk(chunk, chunkSize);
  }
};

type ReaderLike = {
  read: () => Promise<{ done: boolean; value: ByteChunk; }>;
  cancel: () => Promise<void>;
};

type StreamLike = {
  [Symbol.asyncIterator]?: () => AsyncIterator<ByteChunk>;
  getReader?: () => ReaderLike;
};

const readStream = async function* (stream: unknown): AsyncGenerator<ByteChunk> {
  const s = stream as StreamLike;
  if (s[Symbol.asyncIterator]) {
    yield* s as AsyncIterable<ByteChunk>;
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
          controller.enqueue(new Uint8Array(value as unknown as ArrayBuffer));
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
