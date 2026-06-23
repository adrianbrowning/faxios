"use strict";

import stream from "node:stream";
import utils from "../utils.js";

const kInternals = Symbol("internals");

type Internals = {
  timeWindow: number;
  chunkSize: number;
  maxRate: number;
  minChunkSize: number | false;
  bytesSeen: number;
  isCaptured: boolean;
  notifiedBytesLoaded: number;
  ts: number;
  bytes: number;
  onReadCallback: (() => void) | null;
};

type AxiosTransformStreamWithInternals = AxiosTransformStream & {
  [kInternals]: Internals;
};

class AxiosTransformStream extends stream.Transform {
  constructor(options?: Record<string, unknown>) {
    const resolvedOptions = utils.toFlatObject(
      options,
      {
        maxRate: 0,
        chunkSize: 64 * 1024,
        minChunkSize: 100,
        timeWindow: 500,
        ticksRate: 2,
        samplesCount: 15,
      },
      null as unknown as false,
      (prop: string, source: unknown) => !utils.isUndefined((source as Record<string, unknown>)[prop])
    );

    super({
      readableHighWaterMark: resolvedOptions["chunkSize"] as number,
    });

    const internals: Internals = ((this as unknown as AxiosTransformStreamWithInternals)[kInternals] = {
      timeWindow: resolvedOptions["timeWindow"] as number,
      chunkSize: resolvedOptions["chunkSize"] as number,
      maxRate: resolvedOptions["maxRate"] as number,
      minChunkSize: resolvedOptions["minChunkSize"] as number | false,
      bytesSeen: 0,
      isCaptured: false,
      notifiedBytesLoaded: 0,
      ts: Date.now(),
      bytes: 0,
      onReadCallback: null,
    });

    this.on("newListener", (event: string) => {
      if (event === "progress") {
        if (!internals.isCaptured) {
          internals.isCaptured = true;
        }
      }
    });
  }

  override _read(size: number): void {
    const internals = (this as unknown as AxiosTransformStreamWithInternals)[kInternals];

    if (internals.onReadCallback) {
      internals.onReadCallback();
    }

    return super._read(size);
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: stream.TransformCallback): void {
    const internals = (this as unknown as AxiosTransformStreamWithInternals)[kInternals];
    const maxRate = internals.maxRate;

    const readableHighWaterMark = this.readableHighWaterMark;

    const timeWindow = internals.timeWindow;

    const divider = 1000 / timeWindow;
    const bytesThreshold = maxRate / divider;
    const minChunkSize =
      internals.minChunkSize !== false
        ? Math.max(internals.minChunkSize, bytesThreshold * 0.01)
        : 0;

    const pushChunk = (_chunk: Buffer, _callback: () => void): void => {
      const bytes = _chunk.byteLength;
      internals.bytesSeen += bytes;
      internals.bytes += bytes;

      internals.isCaptured && this.emit("progress", internals.bytesSeen);

      if (this.push(_chunk)) {
        process.nextTick(_callback);
      }
      else {
        internals.onReadCallback = () => {
          internals.onReadCallback = null;
          process.nextTick(_callback);
        };
      }
    };

    const transformChunk = (_chunk: Buffer, _callback: (err: Error | null, chunk?: Buffer) => void): ReturnType<typeof setTimeout> | void => {
      const chunkSize = _chunk.byteLength;
      let chunkRemainder: Buffer | null = null;
      let maxChunkSize = readableHighWaterMark;
      let bytesLeft: number | undefined;
      let passed = 0;

      if (maxRate) {
        const now = Date.now();

        if (!internals.ts || (passed = now - internals.ts) >= timeWindow) {
          internals.ts = now;
          bytesLeft = bytesThreshold - internals.bytes;
          internals.bytes = bytesLeft < 0 ? -bytesLeft : 0;
          passed = 0;
        }

        bytesLeft = bytesThreshold - internals.bytes;
      }

      if (maxRate) {
        if ((bytesLeft ?? 0) <= 0) {
          // next time window
          return setTimeout(() => {
            _callback(null, _chunk);
          }, timeWindow - passed);
        }

        if ((bytesLeft ?? 0) < maxChunkSize) {
          maxChunkSize = bytesLeft!;
        }
      }

      if (maxChunkSize && chunkSize > maxChunkSize && chunkSize - maxChunkSize > minChunkSize) {
        chunkRemainder = _chunk.subarray(maxChunkSize);
        _chunk = _chunk.subarray(0, maxChunkSize);
      }

      pushChunk(
        _chunk,
        chunkRemainder
          ? () => {
            process.nextTick(_callback, null, chunkRemainder);
          }
          : () => _callback(null)
      );
    };

    transformChunk(chunk, function transformNextChunk(err: Error | null, _chunk?: Buffer) {
      if (err) {
        return callback(err);
      }

      if (_chunk) {
        transformChunk(_chunk, transformNextChunk);
      }
      else {
        callback(null);
      }
    });
  }
}

export default AxiosTransformStream;
