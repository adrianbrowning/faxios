import assert from "node:assert";
import type { ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "vitest";
import faxios, { CanceledError, FaxiosError } from "#src/index.js";
import type { FaxiosRequestConfig } from "#src/index.js";
import { startHTTPServer, stopHTTPServer } from "../../setup/server.js";
import { makeSchema } from "./_schemaTestHelpers.js";

const URL = "http://localhost/test";

function jsonFetch(calls: Array<unknown> = []) {
  return async (input: Request | string | URL) => {
    calls.push(input);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

// Lets every pending promise callback and I/O callback run, without waiting on a timer.
const flush = async () => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setImmediate(resolve);
  return promise;
};

const isBadTimeout = (err: unknown) =>
  err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION_VALUE && err.message.includes("timeout");

describe("core::cancellation", () => {
  describe("abort during async pre-flight validation", () => {
    for (const option of [ "requestSchema", "paramsSchema" ] as const) {
      it(`settles at once without middleware and never calls fetch, while ${option} is still pending`, async () => {
        const calls: Array<unknown> = [];
        const controller = new AbortController();
        const { promise: started, resolve: start } = Promise.withResolvers<void>();
        const { promise: gate, resolve: open } = Promise.withResolvers<void>();
        const schema = makeSchema(async (value: unknown) => {
          start();
          await gate;
          return { value };
        });
        const api = faxios.create({ env: { fetch: jsonFetch(calls) } });

        try {
          let outcome: unknown = "pending";
          const request = api.post(URL, { a: 1 }, { signal: controller.signal, params: { q: 1 }, [option]: schema })
            .then(() => "resolved", (err: unknown) => err);
          void request.then(value => {
            outcome = value;
          });
          await started;
          controller.abort();
          await flush();

          assert.ok(outcome instanceof CanceledError, `expected a CanceledError, got ${String(outcome)}`);
          assert.strictEqual(outcome.code, FaxiosError.ERR_CANCELED);
        }
        finally {
          open();
          await flush();
        }
        assert.strictEqual(calls.length, 0);
      });
    }
  });

  describe("timeout validation", () => {
    for (const timeout of [ -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31 ]) {
      it(`rejects timeout ${timeout} with ERR_BAD_OPTION_VALUE before middleware runs`, async () => {
        const calls: Array<unknown> = [];
        let ran = false;
        const api = faxios.create({ env: { fetch: jsonFetch(calls) } }).use(async (ctx, next) => {
          ran = true;
          return next(ctx);
        });

        await assert.rejects(api.get(URL, { timeout }), isBadTimeout);
        assert.strictEqual(ran, false);
        assert.strictEqual(calls.length, 0);
      });
    }

    it("rejects an out-of-range timeout without middleware", async () => {
      const calls: Array<unknown> = [];
      const api = faxios.create({ env: { fetch: jsonFetch(calls) } });

      await assert.rejects(api.get(URL, { timeout: -1 }), isBadTimeout);
      await assert.rejects(api.get(URL, { timeout: 2 ** 31 }), isBadTimeout);
      assert.strictEqual(calls.length, 0);
    });

    it("rejects an out-of-range timeout a middleware sets", async () => {
      const calls: Array<unknown> = [];
      const api = faxios.create({ env: { fetch: jsonFetch(calls) } }).use(async (ctx, next) => next({ ...ctx, config: { ...ctx.config, timeout: -1 } }));

      await assert.rejects(api.get(URL), isBadTimeout);
      assert.strictEqual(calls.length, 0);
    });

    it("accepts 0, the setTimeout limit and a numeric string", async () => {
      const api = faxios.create({ env: { fetch: jsonFetch() } });

      for (const timeout of [ 0, 2_147_483_647, "30" as unknown as number ]) {
        const response = await api.get(URL, { timeout });
        assert.deepStrictEqual(response.data, { ok: true });
      }
    });
  });

  describe("abort reason", () => {
    const reason = new Error("user left");

    const assertCanceledBy = (err: unknown) => {
      assert.ok(err instanceof CanceledError, `expected a CanceledError, got ${String(err)}`);
      assert.strictEqual(err.code, FaxiosError.ERR_CANCELED);
      assert.strictEqual(err.message, "user left");
      assert.strictEqual(err.cause, reason);
      return true;
    };

    it("is the cause when the signal is aborted before the request is sent", async () => {
      const controller = new AbortController();
      controller.abort(reason);

      await assert.rejects(faxios.create({ env: { fetch: jsonFetch() } }).get(URL, { signal: controller.signal }), assertCanceledBy);
      await assert.rejects(
        faxios.create({ env: { fetch: jsonFetch() } }).use(async (ctx, next) => next(ctx))
          .get(URL, { signal: controller.signal }),
        assertCanceledBy
      );
    });

    it("is the cause when the signal is aborted while a middleware waits", async () => {
      const controller = new AbortController();
      const { promise: gate, resolve: open } = Promise.withResolvers<void>();
      const api = faxios.create({ env: { fetch: jsonFetch() } }).use(async (ctx, next) => {
        await gate;
        return next(ctx);
      });

      const request = api.get(URL, { signal: controller.signal });
      controller.abort(reason);
      try {
        await assert.rejects(request, assertCanceledBy);
      }
      finally {
        open();
      }
    });

    it("is the cause when the signal is aborted during an async schema", async () => {
      const controller = new AbortController();
      const schema = makeSchema(async (value: unknown) => {
        controller.abort(reason);
        return { value };
      });

      await assert.rejects(faxios.create({ env: { fetch: jsonFetch() } }).post(URL, {}, { signal: controller.signal, requestSchema: schema }), assertCanceledBy);
    });

    it("is the cause when the signal is aborted while waiting for the response", async () => {
      const { promise: received, resolve: receive } = Promise.withResolvers<void>();
      const server = await startHTTPServer((_req, res: ServerResponse) => {
        receive();
        res.on("close", () => res.end());
      });
      try {
        const controller = new AbortController();
        const config: FaxiosRequestConfig = { signal: controller.signal, allowAbsoluteUrls: true };
        const request = faxios.get(`http://localhost:${(server.address() as AddressInfo).port}/`, config);
        await received;
        controller.abort(reason);

        await assert.rejects(request, assertCanceledBy);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("is the cause when the signal is aborted while the body is read", async () => {
      const server = await startHTTPServer((_req, res: ServerResponse) => {
        res.setHeader("Content-Type", "text/plain");
        res.write("first chunk");
        res.on("close", () => res.end());
      });
      try {
        const controller = new AbortController();
        const request = faxios.get(`http://localhost:${(server.address() as AddressInfo).port}/`, {
          allowAbsoluteUrls: true,
          signal: controller.signal,
          onDownloadProgress: () => controller.abort(reason),
        });

        await assert.rejects(request, assertCanceledBy);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("takes a string reason as the message", async () => {
      const controller = new AbortController();
      controller.abort("user left");

      await assert.rejects(faxios.create({ env: { fetch: jsonFetch() } }).get(URL, { signal: controller.signal }), (err: unknown) =>
        err instanceof CanceledError && err.message === "user left");
    });
  });
});
