"use strict";

import stream from "node:stream";
import type { TransformCallback } from "node:stream";

class ZlibHeaderTransformStream extends stream.Transform {
  __transform(chunk: unknown, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.push(chunk);
    callback();
  }

  override _transform(chunk: unknown, encoding: BufferEncoding, callback: TransformCallback): void {
    const buf = chunk as Buffer;
    if (buf.length !== 0) {
      this._transform = this.__transform.bind(this) as typeof this._transform;

      // Add Default Compression headers if no zlib headers are present
      if (buf[0] !== 120) {
        // Hex: 78
        const header = Buffer.alloc(2);
        header[0] = 120; // Hex: 78
        header[1] = 156; // Hex: 9C
        this.push(header, encoding);
      }
    }

    this.__transform(buf, encoding, callback);
  }
}

export default ZlibHeaderTransformStream;
