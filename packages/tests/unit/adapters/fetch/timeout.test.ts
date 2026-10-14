import assert from "node:assert";
import type { ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { AbortController } from "abortcontroller-polyfill/dist/cjs-ponyfill.js";
import { describe, it, vi } from "vitest";
import faxios from "#src/index.js";
import type { GenericAbortSignal } from "#src/lib/types.js";
import {
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

// A handler that holds every response until the test releases it, so the request can only time out.
const createStall = () => {
  const pending: Array<ServerResponse> = [];
  const handler = (_req: unknown, res: ServerResponse) => {
    pending.push(res);
  };
  const release = () => {
    for (const res of pending.splice(0)) res.end("OK");
  };
  return { handler, release };
};

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    it("should support a timeout", async () => {
      const { handler, release } = createStall();
      const server = await startHTTPServer(handler);

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
        release();
        await stopHTTPServer(server);
      }
    });

    describe("fetch adapter - timeout normalization", () => {
      it("should reject with an FaxiosError(ETIMEDOUT) on timeout", async () => {
        const { handler, release } = createStall();
        const server = await startHTTPServer(handler);

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
          release();
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

      it(
        "should surface ETIMEDOUT when fetch rejects with a broken DOMException on abort (Safari)",
        async () => {
          vi.useFakeTimers();
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

          const assertion = assert.rejects(
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

          try {
            await vi.advanceTimersByTimeAsync(50);
            await assertion;
          }
          finally {
            vi.useRealTimers();
          }
        }
      );
    });
  }
);
