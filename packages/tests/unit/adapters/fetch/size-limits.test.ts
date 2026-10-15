import assert from "node:assert";
import type { AddressInfo } from "node:net";
import stream from "node:stream";
import { describe, it, vi } from "vitest";
import faxios from "#src/index.js";
import utils from "#src/lib/utils.js";
import {
  startHTTPServer,
  stopHTTPServer
} from "../../../setup/server.js";
import { fetchFaxios } from "./_helpers.js";

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    describe("size limits", () => {
      const makeUploadStream = (totalBytes: number, chunkSize = 512) => {
        let remaining = totalBytes;

        return new ReadableStream({
          pull(controller) {
            if (remaining <= 0) {
              controller.close();
              return;
            }

            const size = Math.min(chunkSize, remaining);
            remaining -= size;
            controller.enqueue(new Uint8Array(size));
          },
        });
      };

      it("should reject an outbound body that exceeds maxBodyLength with ERR_BAD_REQUEST", async () => {
        const server = await startHTTPServer(
          (_req, res) => {
            res.end("ok");
          }
        );

        try {
          await assert.rejects(
            fetchFaxios.post(`http://localhost:${(server.address() as AddressInfo).port}/`, "A".repeat(2048), {
              maxBodyLength: 1024,
            }),
            err => {
              const e = err as { code: string; message: string; };
              assert.strictEqual(e.code, "ERR_BAD_REQUEST");
              assert.match(
                e.message,
                /Request body larger than maxBodyLength limit/
              );
              return true;
            }
          );
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should reject a streamed outbound body that exceeds maxBodyLength during upload", async () => {
        let bytesReceived = 0;
        const server = await startHTTPServer(
          (req, res) => {
            req.on("data", chunk => {
              bytesReceived += chunk.length;
            });
            req.on("error", () => {});
            req.on("end", () => {
              res.end("ok");
            });
          }
        );

        try {
          await assert.rejects(
            fetchFaxios.post(`http://localhost:${(server.address() as AddressInfo).port}/`, makeUploadStream(2048), {
              maxBodyLength: 1024,
              headers: { "Content-Type": "application/octet-stream" },
            }),
            err => {
              const e = err as { code: string; message: string; };
              assert.strictEqual(e.code, "ERR_BAD_REQUEST");
              assert.strictEqual(
                e.message,
                "Request body larger than maxBodyLength limit"
              );
              return true;
            }
          );

          assert.ok(
            bytesReceived <= 1024,
            `server should not receive more than maxBodyLength; got ${bytesReceived}`
          );
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should enforce maxBodyLength on a stream even when a smaller Content-Length is declared", async () => {
        let bytesReceived = 0;
        const server = await startHTTPServer(
          (req, res) => {
            req.on("data", chunk => {
              bytesReceived += chunk.length;
            });
            req.on("error", () => {});
            req.on("end", () => {
              res.end("ok");
            });
          }
        );

        try {
          await assert.rejects(
            // A caller-declared Content-Length that under-reports the real body
            // must not let an oversized stream slip past the limit.
            fetchFaxios.post(`http://localhost:${(server.address() as AddressInfo).port}/`, makeUploadStream(8192), {
              maxBodyLength: 1024,
              headers: {
                "Content-Type": "application/octet-stream",
                "Content-Length": "500",
              },
            }),
            err => {
              const e = err as { code: string; message: string; };
              assert.strictEqual(e.code, "ERR_BAD_REQUEST");
              assert.strictEqual(
                e.message,
                "Request body larger than maxBodyLength limit"
              );
              return true;
            }
          );

          assert.ok(
            bytesReceived <= 1024,
            `server should not receive more than maxBodyLength; got ${bytesReceived}`
          );
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      // The fields total 1000 bytes; the multipart framing takes the body past 1024.
      it.each([
        [ "without onUploadProgress", {}],
        [ "with onUploadProgress", { onUploadProgress() {} }],
      ])("should count a FormData body against maxBodyLength as it streams, %s", async (_label, options) => {
        let bytesReceived = 0;
        const server = await startHTTPServer(
          (req, res) => {
            req.on("data", chunk => {
              bytesReceived += chunk.length;
            });
            req.on("error", () => {});
            req.on("end", () => {
              res.end("ok");
            });
          }
        );
        const arrayBuffer = vi.spyOn(Request.prototype, "arrayBuffer");

        try {
          const form = new FormData();
          form.append("field", "a".repeat(1000));

          await assert.rejects(
            fetchFaxios.post(`http://localhost:${(server.address() as AddressInfo).port}/`, form, { ...options, maxBodyLength: 1024 }),
            err => {
              const e = err as { code: string; message: string; };
              assert.strictEqual(e.code, "ERR_BAD_REQUEST");
              assert.strictEqual(e.message, "Request body larger than maxBodyLength limit");
              return true;
            }
          );

          assert.strictEqual(arrayBuffer.mock.calls.length, 0);
          assert.ok(
            bytesReceived <= 1024,
            `server should not receive more than maxBodyLength; got ${bytesReceived}`
          );
        }
        finally {
          arrayBuffer.mockRestore();
          await stopHTTPServer(server);
        }
      });

      it("should reject a FormData body whose fields alone exceed maxBodyLength before sending it", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const arrayBuffer = vi.spyOn(Request.prototype, "arrayBuffer");

        try {
          const form = new FormData();
          form.append("file", new Blob([ new Uint8Array(4096) ]), "file.bin");

          await assert.rejects(
            fetchFaxios.post("http://localhost/", form, { maxBodyLength: 1024 }),
            err => {
              const e = err as { code: string; message: string; };
              assert.strictEqual(e.code, "ERR_BAD_REQUEST");
              assert.strictEqual(e.message, "Request body larger than maxBodyLength limit");
              return true;
            }
          );

          assert.strictEqual(arrayBuffer.mock.calls.length, 0);
          assert.strictEqual(fetchSpy.mock.calls.length, 0);
        }
        finally {
          arrayBuffer.mockRestore();
          fetchSpy.mockRestore();
        }
      });

      it("should enforce maxBodyLength with custom fetch when Request is unavailable", async () => {
        let bytesRead = 0;

        await assert.rejects(
          fetchFaxios.post("/", makeUploadStream(2048), {
            maxBodyLength: 1024,
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Length": "1",
            },
            env: {
              Request: null,
              async fetch(
                _url: Request | string | URL,
                options?: RequestInit & {
                  body?: AsyncIterable<{ byteLength: number; }>;
                }
              ) {
                for await (const chunk of options!.body as AsyncIterable<{
                  byteLength: number;
                }>) {
                  bytesRead += chunk.byteLength;
                }
                return {
                  headers: {},
                  status: 200,
                  statusText: "OK",
                  text: async () => "ok",
                };
              },
            } as unknown as { fetch?: typeof fetch; Request?: typeof Request; },
          }),
          err => {
            const e = err as { code: string; message: string; };
            assert.strictEqual(e.code, "ERR_BAD_REQUEST");
            assert.strictEqual(
              e.message,
              "Request body larger than maxBodyLength limit"
            );
            return true;
          }
        );

        assert.ok(
          bytesRead <= 1024,
          `custom fetch read too many bytes; got ${bytesRead}`
        );
      });

      it("should not force ReadableStream bodies when Request does not support request streams", async () => {
        let fetchCalled = false;

        class NoStreamRequest {
          constructor(_url: Request | string | URL, init?: { body?: unknown; }) {
            if (init && utils.isReadableStream!(init.body)) {
              throw new TypeError(
                "ReadableStream request bodies are unsupported"
              );
            }
          }
        }

        await assert.rejects(
          fetchFaxios.post("/", stream.Readable.from([ Buffer.alloc(2048) ]), {
            maxBodyLength: 1024,
            headers: {
              "Content-Type": "application/octet-stream",
            },
            env: {
              Request: NoStreamRequest,
              Response: null,
              async fetch() {
                fetchCalled = true;
                return {
                  headers: {},
                  status: 200,
                  statusText: "OK",
                  text: async () => "ok",
                };
              },
            } as unknown as { fetch?: typeof fetch; Request?: typeof Request; },
          }),
          err => {
            const e = err as { code: string; message: string; };
            assert.strictEqual(e.code, "ERR_NOT_SUPPORT");
            assert.strictEqual(
              e.message,
              "Stream request bodies are not supported by the current fetch implementation"
            );
            return true;
          }
        );

        assert.strictEqual(
          fetchCalled,
          false,
          "fetch must not receive a forced ReadableStream body"
        );
      });

      it("should reject a response whose Content-Length exceeds maxContentLength with ERR_BAD_RESPONSE", async () => {
        const payload = "A".repeat(8 * 1024);
        const server = await startHTTPServer(
          (_req, res) => {
            res.setHeader("Content-Length", Buffer.byteLength(payload));
            res.end(payload);
          }
        );

        try {
          await assert.rejects(
            fetchFaxios.get(`http://localhost:${(server.address() as AddressInfo).port}/`, {
              maxContentLength: 1024,
            }),
            err => {
              const e = err as { code: string; message: string; };
              assert.strictEqual(e.code, "ERR_BAD_RESPONSE");
              assert.match(e.message, /maxContentLength size of 1024 exceeded/);
              return true;
            }
          );
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should handle plain object response headers while enforcing maxContentLength", async () => {
        const { data, headers } = await fetchFaxios.get("/", {
          maxContentLength: 10,
          env: {
            async fetch() {
              return {
                status: 200,
                statusText: "OK",
                headers: {
                  "content-length": "4",
                  foo: "bar",
                },
                body: new ReadableStream({
                  start(controller) {
                    controller.enqueue(new Uint8Array([ 116, 101, 115, 116 ]));
                    controller.close();
                  },
                }),
              };
            },
          } as unknown as { fetch?: typeof fetch; },
        });

        assert.strictEqual(data, "test");
        assert.strictEqual(headers.get("foo"), "bar");
      });

      it("should reject a chunked response that exceeds maxContentLength during streaming", async () => {
        const server = await startHTTPServer(
          (_req, res) => {
            // Omit content-length so the cheap pre-check cannot fire; force
            // the stream-based enforcement path.
            res.setHeader("Transfer-Encoding", "chunked");
            const chunk = "B".repeat(1024);
            let sent = 0;
            const writeNext = (): void => {
              if (sent >= 8) {
                res.end();
                return;
              }
              sent++;
              res.write(chunk, writeNext);
            };
            writeNext();
          }
        );

        try {
          await assert.rejects(
            fetchFaxios.get(`http://localhost:${(server.address() as AddressInfo).port}/`, {
              maxContentLength: 512,
            }),
            err => {
              const e = err as { code: string; message: string; };
              assert.strictEqual(e.code, "ERR_BAD_RESPONSE");
              assert.match(e.message, /maxContentLength size of 512 exceeded/);
              return true;
            }
          );
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should reject a data: URL whose decoded size exceeds maxContentLength (base64)", async () => {
        const payload = "A".repeat(4096);
        const dataUrl =
          "data:application/octet-stream;base64," +
          Buffer.from(payload).toString("base64");

        // Use a dedicated instance without baseURL — combineURLs would otherwise
        // prepend baseURL to a data: URL and neutralise the pre-check.
        const bareFaxios = faxios.create();

        await assert.rejects(
          bareFaxios.get(dataUrl, { maxContentLength: 16 }),
          err => {
            const e = err as { code: string; message: string; };
            assert.strictEqual(e.code, "ERR_BAD_RESPONSE");
            assert.match(e.message, /maxContentLength size of 16 exceeded/);
            return true;
          }
        );
      });

      it("should reject a data: URL whose body size exceeds maxContentLength (non-base64)", async () => {
        const dataUrl = "data:text/plain," + "X".repeat(4096);

        const bareFaxios = faxios.create();

        await assert.rejects(
          bareFaxios.get(dataUrl, { maxContentLength: 16 }),
          err => {
            const e = err as { code: string; message: string; };
            assert.strictEqual(e.code, "ERR_BAD_RESPONSE");
            assert.match(e.message, /maxContentLength size of 16 exceeded/);
            return true;
          }
        );
      });

      it("should allow a percent-encoded data: URL within decoded maxContentLength", async () => {
        const bareFaxios = faxios.create();
        const { data } = await bareFaxios.get("data:text/plain,%E2%82%AC", {
          maxContentLength: 4,
        });

        assert.strictEqual(data, "\u20ac");
      });

      it("should allow a response at or below maxContentLength", async () => {
        const payload = "ok";
        const server = await startHTTPServer(
          (_req, res) => {
            res.end(payload);
          }
        );

        try {
          const { data } = await fetchFaxios.get(`http://localhost:${(server.address() as AddressInfo).port}/`, {
            maxContentLength: 1024,
          });
          assert.strictEqual(data, payload);
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should allow a streamed outbound body at or below maxBodyLength", async () => {
        const payloadLength = 1024;
        let bytesReceived = 0;
        const server = await startHTTPServer(
          (req, res) => {
            req.on("data", chunk => {
              bytesReceived += chunk.length;
            });
            req.on("end", () => {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ received: bytesReceived }));
            });
          }
        );

        try {
          const { data } = await fetchFaxios.post<Record<string, unknown>>(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            makeUploadStream(payloadLength),
            {
              maxBodyLength: 1024,
              headers: { "Content-Type": "application/octet-stream" },
            }
          );

          assert.strictEqual(data.received, payloadLength);
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should allow a body at or below maxBodyLength", async () => {
        const payload = "hello";
        let received;
        const server = await startHTTPServer(
          (req, res) => {
            const chunks: Array<Buffer> = [];
            req.on("data", c => chunks.push(c));
            req.on("end", () => {
              received = Buffer.concat(chunks).toString();
              res.end("ok");
            });
          }
        );

        try {
          await fetchFaxios.post(`http://localhost:${(server.address() as AddressInfo).port}/`, payload, {
            maxBodyLength: 1024,
          });
          assert.strictEqual(received, payload);
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    });
  }
);
