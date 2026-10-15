import assert from "node:assert";
import type { AddressInfo } from "node:net";
import stream from "node:stream";
import { describe, it, vi } from "vitest";
import type { FaxiosProgressEvent } from "#src/lib/types.js";
import {
  setTimeoutAsync,
  startHTTPServer,
  stopHTTPServer
} from "../../../setup/server.js";
import { fetchFaxios } from "./_helpers.js";

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    describe("progress", () => {
      describe("upload", () => {
        it("should support upload progress capturing", async () => {
          const server = await startHTTPServer(
            {
              rate: 100 * 1024,
            }
          );

          try {
            let content = "";
            const count = 10;
            const chunk = "test";
            const chunkLength = Buffer.byteLength(chunk);
            const contentLength = count * chunkLength;

            const readable = stream.Readable.from(
              (async function* () {
                let i = count;

                while (i-- > 0) {
                  await setTimeoutAsync(1100);
                  content += chunk;
                  yield chunk;
                }
              })()
            );

            const samples: Array<FaxiosProgressEvent> = [];

            const { data } = await fetchFaxios.post(
              `http://localhost:${(server.address() as AddressInfo).port}/`,
              readable,
              {
                onUploadProgress: ({
                  loaded,
                  total,
                  progress,
                  bytes,
                  upload,
                }: FaxiosProgressEvent) => {
                  console.log(
                    `Upload Progress ${loaded} from ${total} bytes (${((progress ?? 0) * 100).toFixed(1)}%)`
                  );

                  samples.push({
                    loaded,
                    total,
                    progress,
                    bytes,
                    upload,
                  } as FaxiosProgressEvent);
                },
                headers: {
                  "Content-Length": contentLength,
                },
                responseType: "text",
              }
            );

            await setTimeoutAsync(500);

            assert.strictEqual(data, content);

            assert.deepStrictEqual(
              samples,
              Array.from(
                (function* () {
                  for (let i = 1; i <= 10; i++) {
                    yield {
                      loaded: chunkLength * i,
                      total: contentLength,
                      progress: (chunkLength * i) / contentLength,
                      bytes: 4,
                      upload: true,
                    };
                  }
                })()
              )
            );
          }
          finally {
            await stopHTTPServer(server);
          }
        }, 15000);

        it("should not fail with get method", async () => {
          const server = await startHTTPServer((_req, res) => res.end("OK"));

          try {
            const { data } = await fetchFaxios.get(
              `http://localhost:${(server.address() as AddressInfo).port}/`,
              {
                onUploadProgress() {},
              }
            );

            assert.strictEqual(data, "OK");
          }
          finally {
            await stopHTTPServer(server);
          }
        });

        it("should report FormData upload progress without buffering the body first", async () => {
          const server = await startHTTPServer(
            (req, res) => {
              let received = 0;
              req.on("data", chunk => {
                received += chunk.length;
              });
              req.on("end", () => {
                res.end(String(received));
              });
            }
          );
          const arrayBuffer = vi.spyOn(Request.prototype, "arrayBuffer");

          try {
            const form = new FormData();
            form.append("file", new Blob([ new Uint8Array(200_000) ]), "file.bin");
            const samples: Array<FaxiosProgressEvent> = [];

            const { data } = await fetchFaxios.post(`http://localhost:${(server.address() as AddressInfo).port}/`, form, {
              onUploadProgress: event => samples.push(event),
              responseType: "text",
            });

            assert.strictEqual(arrayBuffer.mock.calls.length, 0);
            assert.ok(samples.length > 0, "onUploadProgress was not called");
            assert.strictEqual(samples.at(-1)!.loaded, Number(data));
            for (const sample of samples) {
              assert.strictEqual(sample.lengthComputable, false);
              assert.strictEqual(sample.total, undefined);
            }
          }
          finally {
            arrayBuffer.mockRestore();
            await stopHTTPServer(server);
          }
        });
      });

      describe("download", () => {
        it("should support download progress capturing", async () => {
          const server = await startHTTPServer(
            {
              rate: 100 * 1024,
            }
          );

          try {
            let content = "";
            const count = 10;
            const chunk = "test";
            const chunkLength = Buffer.byteLength(chunk);
            const contentLength = count * chunkLength;

            const readable = stream.Readable.from(
              (async function* () {
                let i = count;

                while (i-- > 0) {
                  await setTimeoutAsync(1100);
                  content += chunk;
                  yield chunk;
                }
              })()
            );

            const samples: Array<FaxiosProgressEvent> = [];

            const { data } = await fetchFaxios.post(
              `http://localhost:${(server.address() as AddressInfo).port}/`,
              readable,
              {
                onDownloadProgress: ({
                  loaded,
                  total,
                  progress,
                  bytes,
                  download,
                }: FaxiosProgressEvent) => {
                  console.log(
                    `Download Progress ${loaded} from ${total} bytes (${((progress ?? 0) * 100).toFixed(1)}%)`
                  );

                  samples.push({
                    loaded,
                    total,
                    progress,
                    bytes,
                    download,
                  } as FaxiosProgressEvent);
                },
                headers: {
                  "Content-Length": contentLength,
                },
                responseType: "text",
              }
            );

            await setTimeoutAsync(500);

            assert.strictEqual(data, content);

            assert.deepStrictEqual(
              samples,
              Array.from(
                (function* () {
                  for (let i = 1; i <= 10; i++) {
                    yield {
                      loaded: chunkLength * i,
                      total: contentLength,
                      progress: (chunkLength * i) / contentLength,
                      bytes: 4,
                      download: true,
                    };
                  }
                })()
              )
            );
          }
          finally {
            await stopHTTPServer(server);
          }
        }, 15000);
      });
    });
  }
);
