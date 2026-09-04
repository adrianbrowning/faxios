import assert from "node:assert";
import type { AddressInfo } from "node:net";
import stream from "node:stream";
import util from "node:util";
import { AbortController } from "abortcontroller-polyfill/dist/cjs-ponyfill.js";
import NodeFormData from "form-data";
import { describe, it, vi } from "vitest";
import faxios from "#src/index.js";
import { getFetch } from "#src/lib/adapters/fetch.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { VERSION } from "#src/lib/env/data.js";
import type { GenericAbortSignal } from "#src/lib/types.js";

type FetchFn = (
  input: string | Request | URL,
  init?: RequestInit
) => Promise<Response>;
import type { FaxiosProgressEvent } from "#src/lib/types.js";
import utils from "#src/lib/utils.js";
import {
  startHTTPServer,
  stopHTTPServer,
  setTimeoutAsync,
  makeReadableStream,
  generateReadable,
  makeEchoStream
} from "../../setup/server.js";

const SERVER_PORT = 8010;
const LOCAL_SERVER_URL = `http://localhost:${SERVER_PORT}`;

const pipelineAsync = util.promisify(stream.pipeline);

const fetchFaxios = faxios.create({
  baseURL: LOCAL_SERVER_URL,
  allowAbsoluteUrls: true, // tests spin up per-test servers at dynamic ports
});

const getFetchSignal = (
  input: RequestInfo | URL | { signal?: AbortSignal; },
  init?: RequestInit | { signal?: AbortSignal; }
) =>
  (init && init.signal) ||
  (input && (input as { signal?: AbortSignal; }).signal);

const createBrokenDOMExceptionLikeError = () =>
  Object.defineProperties(
    {},
    {
      name: {
        get() {
          throw new TypeError(
            "The DOMException.name getter can only be used on instances of DOMException"
          );
        },
      },
      message: {
        get() {
          throw new TypeError(
            "The DOMException.message getter can only be used on instances of DOMException"
          );
        },
      },
    }
  );

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    it("rejects malformed HTTP URLs before fetch normalization and preserves config", async () => {
      for (const url of [
        "\u0000https:example.com/users",
        "h\nttp:example.com/users",
      ]) {
        await assert.rejects(
          async () =>
            faxios.get(url, {
              headers: {
                "X-Test": "yes",
              },
            }),
          error => {
            assert.ok(error instanceof FaxiosError);
            const faxiosError = error;
            assert.strictEqual(faxiosError.code, FaxiosError.ERR_INVALID_URL);
            assert.strictEqual(
              faxiosError.message,
              "Invalid URL: missing \"//\" after protocol"
            );
            assert.strictEqual(faxiosError.config!.url, url);
            assert.strictEqual(
              faxiosError.config!.headers.get("X-Test"),
              "yes"
            );
            return true;
          }
        );
      }
    });

    it("should sanitize request headers containing CRLF characters", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              xTest: req.headers["x-test"],
              injected: req.headers.injected ?? null,
            })
          );
        },
        {
          port: SERVER_PORT,
        }
      );

      try {
        const { data } = await fetchFaxios.get<Record<string, unknown>>(
          `${LOCAL_SERVER_URL}/`,
          {
            headers: {
              "x-test": "\tok\r\nInjected: yes ",
            },
          }
        );

        assert.strictEqual(data.xTest, "okInjected: yes");
        assert.strictEqual(data.injected, null);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should not use inherited Symbol.iterator for request headers", async () => {
      const server = await startHTTPServer((req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            authorization: req.headers.authorization,
            xApp: req.headers["x-app"],
            xInjected: req.headers["x-injected"] ?? null,
          })
        );
      });

      try {
        (Object.prototype as Record<symbol, unknown>)[Symbol.iterator] =
          function* () {
            yield [ "X-Injected", "yes" ];
            yield [ "Authorization", "Bearer CHANGED" ];
          };

        const { data } = await fetchFaxios.get<Record<string, unknown>>(
          `http://localhost:${(server.address() as AddressInfo).port}/`,
          {
            headers: {
              Authorization: "Bearer VALID_USER_TOKEN",
              "X-App": "safe",
            },
          }
        );

        assert.strictEqual(data.authorization, "Bearer VALID_USER_TOKEN");
        assert.strictEqual(data.xApp, "safe");
        assert.strictEqual(data.xInjected, null);
      }
      finally {
        delete (Object.prototype as Record<symbol, unknown>)[Symbol.iterator];
        await stopHTTPServer(server);
      }
    });

    it("should allow request interceptors to encode Unicode header values before fetch sends them", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              oprtName: req.headers.oprtname,
            })
          );
        },
        {
          port: SERVER_PORT,
        }
      );

      const instance = faxios.create({
        baseURL: LOCAL_SERVER_URL,
      });

      instance.interceptors.request.use(config => {
        config.headers.oprtName = encodeURIComponent(
          config.headers.oprtName as string
        );
        return config;
      });

      try {
        const { data } = await instance.get<Record<string, unknown>>("/", {
          headers: {
            oprtName: "请求用户",
          },
        });

        assert.strictEqual(data.oprtName, encodeURIComponent("请求用户"));
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should sanitize unencoded Unicode headers before passing them to fetch", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              xTest: req.headers["x-test"],
            })
          );
        },
        {
          port: SERVER_PORT,
        }
      );

      try {
        const { data } = await fetchFaxios.get<Record<string, unknown>>(
          `${LOCAL_SERVER_URL}/`,
          {
            headers: {
              "x-test": "请求用户",
            },
          }
        );

        assert.strictEqual(data.xTest, "");
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    describe("responses", () => {
      it("should support text response type", async () => {
        const originalData = "my data";

        const server = await startHTTPServer(
          (_req, res) => res.end(originalData),
          {
            port: SERVER_PORT,
          }
        );

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              responseType: "text",
            }
          );

          assert.deepStrictEqual(data, originalData);
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should support arraybuffer response type", async () => {
        const originalData = "my data";

        const server = await startHTTPServer(
          (_req, res) => res.end(originalData),
          {
            port: SERVER_PORT,
          }
        );

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              responseType: "arraybuffer",
            }
          );

          assert.deepStrictEqual(
            data,
            Uint8Array.from(new TextEncoder().encode(originalData)).buffer
          );
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should support blob response type", async () => {
        const originalData = "my data";

        const server = await startHTTPServer(
          (_req, res) => res.end(originalData),
          {
            port: SERVER_PORT,
          }
        );

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              responseType: "blob",
            }
          );

          assert.deepStrictEqual(data, new Blob([ originalData ]));
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should support stream response type", async () => {
        const originalData = "my data";

        const server = await startHTTPServer(
          (_req, res) => res.end(originalData),
          {
            port: SERVER_PORT,
          }
        );

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              responseType: "stream",
            }
          );

          assert.ok(
            data instanceof ReadableStream,
            "data is not instanceof ReadableStream"
          );

          const response = new Response(data);

          assert.deepStrictEqual(await response.text(), originalData);
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should support formData response type", async () => {
        const originalData = new FormData();

        originalData.append("x", "123");

        const server = await startHTTPServer(
          async (_req, res) => {
            const response = new Response(originalData);

            res.setHeader(
              "Content-Type",
              response.headers.get("Content-Type") ?? ""
            );

            res.end(await response.text());
          },
          { port: SERVER_PORT }
        );

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              responseType: "formdata",
            }
          );

          assert.ok(
            data instanceof FormData,
            "data is not instanceof FormData"
          );

          assert.deepStrictEqual(
            Object.fromEntries(data.entries()),
            Object.fromEntries(originalData.entries())
          );
        }
        finally {
          await stopHTTPServer(server);
        }
      }, 5000);

      it("should support json response type", async () => {
        const originalData = { x: "my data" };

        const server = await startHTTPServer(
          (_req, res) => res.end(JSON.stringify(originalData)),
          {
            port: SERVER_PORT,
          }
        );

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              responseType: "json",
            }
          );

          assert.deepStrictEqual(data, originalData);
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    });

    describe("progress", () => {
      describe("upload", () => {
        it("should support upload progress capturing", async () => {
          const server = await startHTTPServer(
            {
              rate: 100 * 1024,
            },
            { port: SERVER_PORT }
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
          const server = await startHTTPServer((_req, res) => res.end("OK"), {
            port: SERVER_PORT,
          });

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
      });

      describe("download", () => {
        it("should support download progress capturing", async () => {
          const server = await startHTTPServer(
            {
              rate: 100 * 1024,
            },
            {
              port: SERVER_PORT,
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

    it("should support basic auth", async () => {
      const server = await startHTTPServer(
        (req, res) => res.end(req.headers.authorization),
        {
          port: SERVER_PORT,
        }
      );

      try {
        const user = "foo";
        const headers = { Authorization: "Bearer 1234" };
        const res = await fetchFaxios.get(
          `http://${user}@localhost:${(server.address() as AddressInfo).port}/`,
          {
            headers,
          }
        );

        const base64 = Buffer.from(`${user}:`, "utf8").toString("base64");
        assert.equal(res.data, `Basic ${base64}`);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should decode basic auth credentials from the request URL", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.end(req.headers.authorization);
        },
        { port: SERVER_PORT }
      );

      try {
        const response = await fetchFaxios.get(
          `http://my%40email.com:pa%24ss@localhost:${(server.address() as AddressInfo).port}/`
        );
        const base64 = Buffer.from("my@email.com:pa$ss", "utf8").toString(
          "base64"
        );
        assert.strictEqual(response.data, `Basic ${base64}`);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should UTF-8 encode basic auth credentials from the request URL", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.end(req.headers.authorization);
        },
        { port: SERVER_PORT }
      );

      try {
        const response = await fetchFaxios.get(
          `http://%E7%94%A8%E6%88%B7:pa%C3%9F@localhost:${(server.address() as AddressInfo).port}/`
        );
        const base64 = Buffer.from("\u7528\u6237:pa\u00df", "utf8").toString(
          "base64"
        );
        assert.strictEqual(response.data, `Basic ${base64}`);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("keeps malformed URL credentials percent-encoding and does not throw", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.end(req.headers.authorization);
        },
        { port: SERVER_PORT }
      );

      try {
        const response = await fetchFaxios.get(
          `http://user%:foo%zz@localhost:${(server.address() as AddressInfo).port}/`
        );
        const base64 = Buffer.from("user%:foo%zz", "utf8").toString("base64");
        assert.strictEqual(response.data, `Basic ${base64}`);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should support password-only basic auth credentials from the request URL", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.end(req.headers.authorization);
        },
        { port: SERVER_PORT }
      );

      try {
        const response = await fetchFaxios.get(
          `http://:secret@localhost:${(server.address() as AddressInfo).port}/`
        );
        const base64 = Buffer.from(":secret", "utf8").toString("base64");
        assert.strictEqual(response.data, `Basic ${base64}`);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should prefer config auth over basic auth credentials from the request URL", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.end(req.headers.authorization);
        },
        { port: SERVER_PORT }
      );

      try {
        const auth = { username: "config-user", password: "config-pass" };
        const response = await fetchFaxios.get(
          `http://url-user:url-pass@localhost:${(server.address() as AddressInfo).port}/`,
          { auth }
        );
        const base64 = Buffer.from("config-user:config-pass", "utf8").toString(
          "base64"
        );
        assert.strictEqual(response.data, `Basic ${base64}`);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should support basic auth with a header", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.end(req.headers.authorization);
        },
        { port: SERVER_PORT }
      );

      try {
        const auth = { username: "foo", password: "bar" };
        const headers = { AuThOrIzAtIoN: "Bearer 1234" }; // wonky casing to ensure caseless comparison
        const response = await fetchFaxios.get(
          `http://localhost:${(server.address() as AddressInfo).port}/`,
          {
            auth,
            headers,
          }
        );
        const base64 = Buffer.from("foo:bar", "utf8").toString("base64");
        assert.strictEqual(response.data, `Basic ${base64}`);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should ignore inherited nested auth fields", async () => {
      const server = await startHTTPServer(
        (req, res) => res.end(req.headers.authorization),
        {
          port: SERVER_PORT,
        }
      );

      Object.defineProperty(Object.prototype, "username", {
        value: "inherited-user",
        configurable: true,
      });
      Object.defineProperty(Object.prototype, "password", {
        value: "inherited-pass",
        configurable: true,
      });

      try {
        const response = await fetchFaxios.get(
          `http://localhost:${(server.address() as AddressInfo).port}/`,
          {
            auth: {} as { username: string; password: string; },
          }
        );

        assert.strictEqual(response.data, "Basic Og==");
      }
      finally {
        delete (Object.prototype as Record<string, unknown>).username;
        delete (Object.prototype as Record<string, unknown>).password;
        await stopHTTPServer(server);
      }
    });

    it("should support stream.Readable as a payload", async () => {
      const server = await startHTTPServer(async (_req, res) => res.end("OK"), {
        port: SERVER_PORT,
      });

      try {
        const { data } = await fetchFaxios.post(
          `http://localhost:${(server.address() as AddressInfo).port}/`,
          stream.Readable.from("OK")
        );

        assert.strictEqual(data, "OK");
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    describe("request aborting", () => {
      it("should be able to abort the request stream", async () => {
        const server = await startHTTPServer(
          {
            rate: 100000,
            useBuffering: true,
          },
          { port: SERVER_PORT }
        );

        try {
          const controller = new AbortController();

          setTimeout(() => {
            controller.abort();
          }, 500);

          await assert.rejects(async () => {
            await fetchFaxios.post(
              `http://localhost:${(server.address() as AddressInfo).port}/`,
              makeReadableStream(),
              {
                responseType: "stream",
                signal: controller.signal as GenericAbortSignal,
              }
            );
          }, /CanceledError/);
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should be able to abort the response stream", async () => {
        const server = await startHTTPServer(
          (_req, res) => {
            pipelineAsync(generateReadable(10000, 10), res).catch(() => {
              // Client-side abort intentionally closes the stream early in this test.
            });
          },
          { port: SERVER_PORT }
        );

        try {
          const controller = new AbortController();

          setTimeout(() => {
            controller.abort(new Error("test"));
          }, 800);

          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              responseType: "stream",
              signal: controller.signal as GenericAbortSignal,
            }
          );

          await assert.rejects(async () => {
            await (data as ReadableStream).pipeTo(makeEchoStream(false));
          }, /^(AbortError|CanceledError):/);
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    });

    it("should support a timeout", async () => {
      const server = await startHTTPServer(
        async (_req, res) => {
          await setTimeoutAsync(1000);
          res.end("OK");
        },
        { port: 0 }
      );

      try {
        const timeout = 500;

        const ts = Date.now();

        await assert.rejects(async () => {
          await fetchFaxios(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              timeout,
            }
          );
        }, /timeout/);

        const passed = Date.now() - ts;

        assert.ok(
          passed >= timeout - 5,
          `early cancellation detected (${passed} ms)`
        );
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    describe("fetch adapter - timeout normalization", () => {
      it("should reject with an FaxiosError(ETIMEDOUT) on timeout", async () => {
        const server = await startHTTPServer(
          async (_req, res) => {
            await setTimeoutAsync(1000);
            res.end("OK");
          },
          { port: 0 }
        );

        try {
          await assert.rejects(
            async () =>
              fetchFaxios(
                `http://localhost:${(server.address() as AddressInfo).port}/`,
                {
                  timeout: 200,
                }
              ),
            err => {
              const e = err as { name: string; code: string; message: string; };
              assert.strictEqual(e.name, "FaxiosError");
              assert.strictEqual(e.code, "ETIMEDOUT");
              assert.match(e.message, /timeout of 200ms exceeded/);
              return true;
            }
          );
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should not classify a user-initiated abort as a timeout", async () => {
        const safariFetch = async (
          url: RequestInfo | URL,
          init?: RequestInit
        ) => {
          const signal = getFetchSignal(url, init) as AbortSignal;

          return new Promise((_resolve, reject) => {
            const onAbort = () => {
              signal.removeEventListener("abort", onAbort);
              reject(createBrokenDOMExceptionLikeError());
            };

            if (signal.aborted) return onAbort();
            signal.addEventListener("abort", onAbort);
          });
        };

        const controller = new AbortController();

        const request = fetchFaxios.get("/", {
          signal: controller.signal as GenericAbortSignal,

          env: {
            fetch: safariFetch as unknown as FetchFn,
          },
        });

        controller.abort();

        await assert.rejects(
          async () => request,
          err => {
            const e = err as { name: string; code: string; };
            assert.strictEqual(e.name, "CanceledError");
            assert.strictEqual(e.code, "ERR_CANCELED");
            assert.strictEqual(faxios.isCancel(err), true);
            return true;
          }
        );
      });

      it("should keep cause non-enumerable on a canceled request error", async () => {
        const underlying = new Error("underlying abort failure");

        const abortRejectingFetch = async (
          url: RequestInfo | URL,
          init?: RequestInit
        ) => {
          const signal = getFetchSignal(url, init) as AbortSignal;
          const { promise, reject } = Promise.withResolvers<never>();
          const onAbort = () => {
            signal.removeEventListener("abort", onAbort);
            reject(underlying);
          };

          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort);

          return promise;
        };

        const controller = new AbortController();

        const request = fetchFaxios.get("/", {
          signal: controller.signal as GenericAbortSignal,

          env: {
            fetch: abortRejectingFetch as unknown as FetchFn,
          },
        });

        controller.abort();

        await assert.rejects(
          async () => request,
          err => {
            assert.strictEqual((err as Error).cause, underlying);
            assert.ok(
              !Object.keys(err as object).includes("cause"),
              "cause must not be enumerable"
            );
            return true;
          }
        );
      });

      // Timing-sensitive: a 50ms abort race observed by a fake fetch can flake
      // under CI runner load even though the production code is fine. Retry as
      // a backstop.
      it(
        "should surface ETIMEDOUT when fetch rejects with a broken DOMException on abort (Safari)",
        { retry: 2 },
        async () => {
          const safariFetch = async (
            url: RequestInfo | URL,
            init?: RequestInit
          ) => {
            const signal = getFetchSignal(url, init) as AbortSignal;

            return new Promise((_resolve, reject) => {
              const onAbort = () => {
                signal.removeEventListener("abort", onAbort);
                reject(createBrokenDOMExceptionLikeError());
              };

              if (signal.aborted) return onAbort();
              signal.addEventListener("abort", onAbort);
            });
          };

          await assert.rejects(
            async () =>
              fetchFaxios.get("/", {
                timeout: 50,
                env: {
                  fetch: safariFetch as unknown as (
                    input: string | Request | URL,
                    init?: RequestInit
                  ) => Promise<Response>,
                },
              }),
            err => {
              const e = err as { name: string; code: string; message: string; };
              assert.strictEqual(e.name, "FaxiosError");
              assert.strictEqual(e.code, "ETIMEDOUT");
              assert.match(e.message, /timeout of 50ms exceeded/);
              return true;
            }
          );
        }
      );
    });

    it("should combine baseURL and url", async () => {
      const server = await startHTTPServer(async (_req, res) => res.end("OK"), {
        port: SERVER_PORT,
      });
      try {
        const res = await fetchFaxios("/foo");

        assert.equal(res.config.baseURL, LOCAL_SERVER_URL);
        assert.equal(res.config.url, "/foo");
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should send QUERY requests with a body through the fetch adapter", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          let body = "";
          req.on("data", chunk => {
            body += chunk;
          });
          req.on("end", () => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ method: req.method, url: req.url, body }));
          });
        },
        { port: 0 }
      );

      try {
        const { data } = await fetchFaxios.query<Record<string, unknown>>(
          `http://localhost:${(server.address() as AddressInfo).port}/search`,
          {
            selector: "field1",
          }
        );

        assert.strictEqual(data.method, "QUERY");
        assert.strictEqual(data.url, "/search");
        assert.deepStrictEqual(JSON.parse(data.body as string), {
          selector: "field1",
        });
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should support params", async () => {
      const server = await startHTTPServer((req, res) => res.end(req.url), {
        port: SERVER_PORT,
      });
      try {
        const { data } = await fetchFaxios.get(
          `http://localhost:${(server.address() as AddressInfo).port}/?test=1`,
          {
            params: {
              foo: 1,
              bar: 2,
            },
          }
        );

        assert.strictEqual(data, "/?test=1&foo=1&bar=2");
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should handle fetch failed error as an FaxiosError with ERR_NETWORK code", async () => {
      try {
        await fetchFaxios("http://notExistsUrl.in.nowhere");
        assert.fail("should fail");
      }
      catch (err) {
        const axiosErr = err as FaxiosError;
        assert.strictEqual(String(axiosErr), "FaxiosError: Network Error");
        assert.strictEqual(
          axiosErr.cause && (axiosErr.cause as { code?: string; }).code,
          "ENOTFOUND"
        );
      }
    });

    it("should get response headers", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.setHeader("foo", "bar");
          res.end(req.url);
        },
        { port: SERVER_PORT }
      );

      try {
        const { headers } = await fetchFaxios.get(
          `http://localhost:${(server.address() as AddressInfo).port}/`,
          {
            responseType: "stream",
          }
        );

        assert.strictEqual(headers.get("foo"), "bar");
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    describe("fetch adapter - Content-Type handling", () => {
      it("should set correct Content-Type for FormData automatically", async () => {
        const form = new NodeFormData();
        form.append("foo", "bar");

        const server = await startHTTPServer(
          (req, res) => {
            const contentType = req.headers["content-type"];
            assert.match(contentType!, /^multipart\/form-data; boundary=/i);
            res.end("OK");
          },
          { port: SERVER_PORT }
        );

        try {
          await fetchFaxios.post(
            `http://localhost:${(server.address() as AddressInfo).port}/form`,
            form
          );
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should remove manually set Content-Type without boundary for FormData", async () => {
        const form = new FormData();
        form.append("foo", "bar");

        const server = await startHTTPServer(
          (req, res) => {
            const contentType = req.headers["content-type"];
            assert.match(contentType!, /^multipart\/form-data; boundary=/i);
            res.end("OK");
          },
          { port: SERVER_PORT }
        );

        try {
          await fetchFaxios.post(
            `http://localhost:${(server.address() as AddressInfo).port}/form`,
            form,
            {
              headers: { "Content-Type": "multipart/form-data" },
            }
          );
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should preserve Content-Type if it already has boundary", async () => {
        const form = new FormData();
        form.append("foo", "bar");

        const customBoundary = "----CustomBoundary123";

        const server = await startHTTPServer(
          (req, res) => {
            const contentType = req.headers["content-type"];
            assert.ok(contentType!.includes(customBoundary));
            res.end("OK");
          },
          { port: SERVER_PORT }
        );

        try {
          await fetchFaxios.post(
            `http://localhost:${(server.address() as AddressInfo).port}/form`,
            form,
            {
              headers: {
                "Content-Type": `multipart/form-data; boundary=${customBoundary}`,
              },
            }
          );
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    });

    describe("fetch adapter - User-Agent header", () => {
      it("should set User-Agent header to faxios/<version> by default", async () => {
        const server = await startHTTPServer(
          (req, res) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ userAgent: req.headers["user-agent"] }));
          },
          { port: SERVER_PORT }
        );

        try {
          const { data } = await fetchFaxios.post<Record<string, unknown>>(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              payload: "test",
            }
          );

          assert.strictEqual(data.userAgent, `faxios/${VERSION}`);
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should not override a user-provided User-Agent header", async () => {
        const customUA = "my-custom-agent/1.0";

        const server = await startHTTPServer(
          (req, res) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ userAgent: req.headers["user-agent"] }));
          },
          { port: SERVER_PORT }
        );

        try {
          const { data } = await fetchFaxios.post<Record<string, unknown>>(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            { payload: "test" },
            { headers: { "User-Agent": customUA } }
          );

          assert.strictEqual(data.userAgent, customUA);
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    });

    describe("env config", () => {
      it("should fallback to globalThis when utils.global is temporarily undefined", () => {
        const originalGlobal = utils.global;

        try {
          (utils as { global: unknown; }).global = undefined;

          assert.doesNotThrow(() =>
            getFetch({
              env: {
                fetch() {},
              },
            })
          );
        }
        finally {
          utils.global = originalGlobal;
        }
      });

      it("should respect env fetch API configuration", async () => {
        const { data, headers } = await fetchFaxios.get("/", {
          env: {
            fetch() {
              return {
                headers: {
                  foo: "1",
                },
                text: async () => "test",
              };
            },
          } as unknown as { fetch?: typeof fetch; },
        });

        assert.strictEqual(headers.get("foo"), "1");
        assert.strictEqual(data, "test");
      });

      it("should be able to request with lack of Request object", async () => {
        const form = new FormData();

        form.append("x", "1");

        const { data, headers } = await fetchFaxios.post("/", form, {
          onUploadProgress() {
            // dummy listener to activate streaming
          },
          env: {
            Request: null,
            fetch() {
              return {
                headers: {
                  foo: "1",
                },
                text: async () => "test",
              };
            },
          } as unknown as { Request?: typeof Request; fetch?: typeof fetch; },
        });

        assert.strictEqual(headers.get("foo"), "1");
        assert.strictEqual(data, "test");
      });

      it("should be able to handle response with lack of Response object", async () => {
        const { data, headers } = await fetchFaxios.get("/", {
          onDownloadProgress() {
            // dummy listener to activate streaming
          },
          env: {
            Request: null,
            Response: null,
            fetch() {
              return {
                headers: {
                  foo: "1",
                },
                text: async () => "test",
              };
            },
          } as unknown as { Request?: typeof Request; fetch?: typeof fetch; },
        });

        assert.strictEqual(headers.get("foo"), "1");
        assert.strictEqual(data, "test");
      });

      it("should fallback to the global on undefined env value", async () => {
        const server = await startHTTPServer((_req, res) => res.end("OK"), {
          port: SERVER_PORT,
        });

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              env: {
                fetch: undefined,
              },
            }
          );

          assert.strictEqual(data, "OK");
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should use current global fetch when env fetch is not specified", async () => {
        const globalFetch = global.fetch;

        vi.stubGlobal("fetch", async () => ({
          headers: {
            foo: "1",
          },
          text: async () => "global",
        }));

        const server = await startHTTPServer((_req, res) => res.end("OK"), {
          port: SERVER_PORT,
        });

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              env: {
                fetch: undefined,
              },
            }
          );

          assert.strictEqual(data, "global");
        }
        finally {
          vi.stubGlobal("fetch", globalFetch);
          await stopHTTPServer(server);
        }
      });
    });

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
          },
          { port: SERVER_PORT }
        );

        try {
          await assert.rejects(
            fetchFaxios.post(`${LOCAL_SERVER_URL}/`, "A".repeat(2048), {
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
          },
          { port: SERVER_PORT }
        );

        try {
          await assert.rejects(
            fetchFaxios.post(`${LOCAL_SERVER_URL}/`, makeUploadStream(2048), {
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
          },
          { port: SERVER_PORT }
        );

        try {
          await assert.rejects(
            // A caller-declared Content-Length that under-reports the real body
            // must not let an oversized stream slip past the limit.
            fetchFaxios.post(`${LOCAL_SERVER_URL}/`, makeUploadStream(8192), {
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
                _url: string | Request | URL,
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
            } as unknown as { Request?: typeof Request; fetch?: typeof fetch; },
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
          constructor(_url: string | Request | URL, init?: { body?: unknown; }) {
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
            } as unknown as { Request?: typeof Request; fetch?: typeof fetch; },
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
          },
          { port: SERVER_PORT }
        );

        try {
          await assert.rejects(
            fetchFaxios.get(`${LOCAL_SERVER_URL}/`, {
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
          },
          { port: SERVER_PORT }
        );

        try {
          await assert.rejects(
            fetchFaxios.get(`${LOCAL_SERVER_URL}/`, {
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

      it("should not count a data: URL fragment toward maxContentLength", async () => {
        // fetch strips #fragment before decoding, so only "ABC" is the body.
        const dataUrl =
          "data:text/plain;base64," +
          Buffer.from("ABC").toString("base64") +
          "#" +
          "A".repeat(4096);

        const bareFaxios = faxios.create();

        const { data } = await bareFaxios.get(dataUrl, {
          maxContentLength: 16,
        });

        assert.strictEqual(data, "ABC");
      });

      it("should allow a response at or below maxContentLength", async () => {
        const payload = "ok";
        const server = await startHTTPServer(
          (_req, res) => {
            res.end(payload);
          },
          { port: SERVER_PORT }
        );

        try {
          const { data } = await fetchFaxios.get(`${LOCAL_SERVER_URL}/`, {
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
          },
          { port: SERVER_PORT }
        );

        try {
          const { data } = await fetchFaxios.post<Record<string, unknown>>(
            `${LOCAL_SERVER_URL}/`,
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
          },
          { port: SERVER_PORT }
        );

        try {
          await fetchFaxios.post(`${LOCAL_SERVER_URL}/`, payload, {
            maxBodyLength: 1024,
          });
          assert.strictEqual(received, payload);
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    });

    describe("prototype pollution hardening", () => {
      it("should ignore Object.prototype pollution on method, headers, and credentials", async () => {
        let capturedInit: RequestInit | undefined;
        const mockFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
          capturedInit = init;
          return new Response(JSON.stringify({}), { headers: { "content-type": "application/json" } });
        };

        const polluted = Object.prototype as Record<string, unknown>;
        polluted["method"] = "EVIL";
        polluted["headers"] = { "x-injected": "yes" };
        polluted["credentials"] = "include";

        try {
          await fetchFaxios.get(`${LOCAL_SERVER_URL}/`, { env: { fetch: mockFetch } });
        }
        finally {
          delete polluted["method"];
          delete polluted["headers"];
          delete polluted["credentials"];
        }

        assert.ok(capturedInit, "fetch should have been called");
        assert.strictEqual(capturedInit.method, "GET", "polluted method must not override GET");
        assert.ok(
          !("x-injected" in ((capturedInit.headers as Record<string, string>) ?? {})),
          "polluted headers must not bleed into request"
        );
        assert.notStrictEqual(capturedInit.credentials, "include", "polluted credentials must not override");
      });
    });

    describe("capability probe cleanup", () => {
      it("should cancel the ReadableStream created during the request stream probe", () => {
        // The fetch adapter factory probes for request-stream support by creating
        // a ReadableStream as a Request body.  Previously the stream was never
        // cancelled, leaving a dangling pull-algorithm promise (async resource leak
        // visible via `--detect-async-leaks` or Node.js async_hooks).
        //
        // Calling getFetch with a unique env triggers a fresh factory() execution
        // (including the probe).  We spy on ReadableStream.prototype.cancel to
        // verify it is invoked during the probe.

        const cancelSpy = vi.spyOn(ReadableStream.prototype, "cancel");

        try {
          // Unique fetch function ensures cache miss → factory() re-runs the probe.
          const uniqueFetch = async () => new Response("ok");
          getFetch({ env: { fetch: uniqueFetch } });

          assert.ok(
            cancelSpy.mock.calls.length > 0,
            "ReadableStream.prototype.cancel should be called during the capability probe"
          );
        }
        finally {
          cancelSpy.mockRestore();
        }
      });
    });
  }
);
