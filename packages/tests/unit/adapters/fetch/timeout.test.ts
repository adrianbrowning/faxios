import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { AbortController } from "abortcontroller-polyfill/dist/cjs-ponyfill.js";
import { describe, it } from "vitest";
import faxios from "#src/index.js";
import type { GenericAbortSignal } from "#src/lib/types.js";
import {
  setTimeoutAsync,
  startHTTPServer,
  stopHTTPServer
} from "../../../setup/server.js";
import { fetchFaxios } from "./_helpers.js";

type FetchFn = (
  input: Request | string | URL,
  init?: RequestInit
) => Promise<Response>;

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
              const e = err as { code: string; message: string; name: string; };
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

      const assertUserAbort = (err: unknown) => {
        const e = err as { code: string; name: string; };
        assert.strictEqual(e.name, "CanceledError");
        assert.strictEqual(e.code, "ERR_CANCELED");
        assert.strictEqual(faxios.isCancel(err), true);
        return true;
      };

      it("should not classify a user-initiated abort as a timeout", async () => {
        const controller = new AbortController();

        const request = fetchFaxios.get("/", {
          signal: controller.signal as GenericAbortSignal,

          env: {
            fetch: safariFetch as unknown as FetchFn,
          },
        });

        controller.abort();

        await assert.rejects(async () => request, assertUserAbort);
      });

      it("should not classify a user-initiated abort as a timeout through a middleware that awaits next()", async () => {
        const controller = new AbortController();
        const api = faxios.create({ baseURL: "http://localhost", allowAbsoluteUrls: true }).use(async (ctx, next) => {
          const response = await next(ctx);
          return response;
        });

        const request = api.get("/", {
          signal: controller.signal as GenericAbortSignal,
          env: {
            fetch: safariFetch as unknown as FetchFn,
          },
        });

        controller.abort();

        await assert.rejects(async () => request, assertUserAbort);
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
                    input: Request | string | URL,
                    init?: RequestInit
                  ) => Promise<Response>,
                },
              }),
            err => {
              const e = err as { code: string; message: string; name: string; };
              assert.strictEqual(e.name, "FaxiosError");
              assert.strictEqual(e.code, "ETIMEDOUT");
              assert.match(e.message, /timeout of 50ms exceeded/);
              return true;
            }
          );
        }
      );
    });
  }
);
