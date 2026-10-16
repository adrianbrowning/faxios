import assert from "node:assert";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "vitest";
import faxios from "#src/index.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { trackStream } from "#src/lib/helpers/trackStream.js";
import { startHTTPServer, stopHTTPServer } from "../../setup/server.js";

// Echo the received body back as a JSON array of byte values.
const echoBytes = async (req: IncomingMessage, res: ServerResponse) => {
  const chunks: Array<Buffer> = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify([ ...Buffer.concat(chunks) ]));
};

const streamOf = (chunks: Array<unknown>) =>
  new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(chunk));
      controller.close();
    },
  });

const readAll = async (stream: unknown) => {
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const out: Array<Uint8Array> = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
};

const badChunk = (message: string) => new FaxiosError(message, FaxiosError.ERR_BAD_REQUEST);

describe("trackStream", () => {
  it("passes Uint8Array chunks through without copying, including split pieces", async () => {
    const small = new Uint8Array([ 1, 2, 3 ]);
    const large = new Uint8Array(256 * 1024);

    const out = await readAll(trackStream(streamOf([ small, large ]), 64 * 1024, badChunk));

    assert.strictEqual(out.length, 5);
    assert.strictEqual(out[0], small);
    for (const piece of out.slice(1)) {
      assert.strictEqual(piece.byteLength, 64 * 1024);
      assert.strictEqual(piece.buffer, large.buffer);
    }
    assert.deepStrictEqual(out.slice(1).map(piece => piece.byteOffset), [ 0, 65536, 131072, 196608 ]);
  });

  it("sends every byte of non-Uint8Array chunks and counts progress in bytes", async () => {
    const progress: Array<number> = [];
    const shared = new Uint8Array([ 9, 8, 7, 6 ]);
    const chunks = [ new Uint16Array([ 1, 2 ]), new DataView(shared.buffer, 1, 2), shared.buffer, "hé" ];

    const out = await readAll(trackStream(streamOf(chunks), 64 * 1024, badChunk, bytes => progress.push(bytes)));

    assert.deepStrictEqual(out.map(chunk => [ ...chunk ]), [[ 1, 0, 2, 0 ], [ 8, 7 ], [ 9, 8, 7, 6 ], [ 0x68, 0xc3, 0xa9 ]]);
    assert.strictEqual(out[1]!.buffer, shared.buffer);
    assert.deepStrictEqual(progress, [ 4, 6, 10, 13 ]);
  });

  it("rejects chunks that are not bytes or strings with the caller's error", async () => {
    const made: Array<string> = [];
    const failure = new Error("bad chunk");
    const toError = (message: string) => {
      made.push(message);
      return failure;
    };

    await assert.rejects(readAll(trackStream(streamOf([ 42 ]), 64 * 1024, toError)), failure);
    assert.deepStrictEqual(made, [ "Stream chunk must be a Uint8Array, another ArrayBufferView, an ArrayBuffer or a string, got number" ]);
  });

  describe("web ReadableStream request bodies sent to a server", () => {
    const cases = [
      [ "onUploadProgress", { onUploadProgress() {} }],
      [ "maxBodyLength", { maxBodyLength: 1024 }],
    ] as const;

    for (const [ name, options ] of cases) {
      it(`keeps Uint16Array and string chunks intact when wrapped for ${name}`, async () => {
        const server = await startHTTPServer((req, res) => void echoBytes(req, res));
        try {
          const { data } = await faxios.post(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            streamOf([ new Uint16Array([ 0x0201, 0x0403 ]), "ab", new Uint8Array([ 5 ]) ]),
            { ...options, headers: { "Content-Type": "application/octet-stream" } }
          );

          assert.deepStrictEqual(data, [ 1, 2, 3, 4, 0x61, 0x62, 5 ]);
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    }

    it("rejects a non-byte chunk with a coded FaxiosError", async () => {
      const server = await startHTTPServer((req, res) => void echoBytes(req, res));
      try {
        await assert.rejects(
          faxios.post(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            streamOf([{ not: "bytes" }]),
            { onUploadProgress() {}, headers: { "Content-Type": "application/octet-stream" } }
          ),
          (err: unknown) => {
            assert.ok(err instanceof FaxiosError);
            assert.strictEqual(err.code, FaxiosError.ERR_BAD_REQUEST);
            assert.ok(err.config);
            return true;
          }
        );
      }
      finally {
        await stopHTTPServer(server);
      }
    });
  });
});
