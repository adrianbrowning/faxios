import assert from "node:assert";
import { AbortController } from "abortcontroller-polyfill/dist/cjs-ponyfill.js";
import { afterEach, describe, it, vi } from "vitest";
import faxios from "#src/index.js";
import type { GenericAbortSignal } from "#src/lib/types.js";
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

// A fetch that never answers and rejects the way fetch does when its signal aborts.
const stallingFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const signal = getFetchSignal(input, init) as AbortSignal;
  return new Promise<Response>((_resolve, reject) => {
    const onAbort = () => reject(new DOMException("This operation was aborted", "AbortError"));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
  });
};

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should support a timeout", async () => {
      vi.useFakeTimers();
      const timeout = 500;
      let settled = false;

      const assertion = assert.rejects(async () => {
        try {
          await fetchFaxios("/", { timeout, env: { fetch: stallingFetch } });
        }
        finally {
          settled = true;
        }
      }, /timeout/);

      await vi.advanceTimersByTimeAsync(timeout - 1);
      assert.strictEqual(settled, false, "early cancellation detected");

      await vi.advanceTimersByTimeAsync(1);
      await assertion;
    });

    describe("fetch adapter - timeout normalization", () => {
      it("should reject with an FaxiosError(ETIMEDOUT) on timeout", async () => {
        vi.useFakeTimers();

        const assertion = assert.rejects(
          async () => fetchFaxios("/", { timeout: 200, env: { fetch: stallingFetch } }),
          err => {
            const e = err as { code: string; message: string; name: string; };
            assert.strictEqual(e.name, "FaxiosError");
            assert.strictEqual(e.code, "ETIMEDOUT");
            assert.match(e.message, /timeout of 200ms exceeded/);
            return true;
          }
        );

        await vi.advanceTimersByTimeAsync(200);
        await assertion;
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
