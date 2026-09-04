import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { describe, it } from "vitest";
import faxios from "#src/index.ts";
import type FaxiosError from "#src/lib/core/FaxiosError.js";
import { startHTTPServer, stopHTTPServer } from "../../setup/server.js";

describe("core::errorStackDecoration", () => {
  it("should preserve the request error when the captured stack is not a string", async () => {
    const server = await startHTTPServer((_req, res) => {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ boom: true }));
    });
    const { port } = server.address() as AddressInfo;

    const originalPrepare = Error.prepareStackTrace;
    let caught: unknown;

    try {
      const instance = faxios.create();

      // A userland prepareStackTrace returning a non-string makes every
      // lazily-materialized `.stack` non-string, including the throwaway one
      // used to decorate request errors.
      Error.prepareStackTrace = () => 42 as unknown as string;

      try {
        await instance.get(`http://127.0.0.1:${port}/`);
      }
      catch (err) {
        caught = err;
      }
      finally {
        Error.prepareStackTrace = originalPrepare;
      }

      assert.ok(caught, "expected the request to reject");
      assert.strictEqual((caught as Error).name, "FaxiosError");
      // settle.ts maps 5xx to ERR_BAD_RESPONSE (4xx would be ERR_BAD_REQUEST)
      assert.strictEqual((caught as FaxiosError).code, "ERR_BAD_RESPONSE");
      assert.strictEqual((caught as FaxiosError).response?.status, 500);
    }
    finally {
      Error.prepareStackTrace = originalPrepare;
      await stopHTTPServer(server);
    }
  });

  it("should leave a non-string error stack untouched instead of coercing it", async () => {
    const server = await startHTTPServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
    const { port } = server.address() as AddressInfo;

    try {
      const instance = faxios.create();
      const thrown = new Error("interceptor blew up");
      // Userland stack replacements are not always strings; decoration must
      // not stringify one behind the caller's back.
      Object.defineProperty(thrown, "stack", {
        value: 42,
        writable: true,
        configurable: true,
      });

      instance.interceptors.request.use(() => {
        throw thrown;
      });

      let caught: unknown;
      try {
        await instance.get(`http://127.0.0.1:${port}/`);
      }
      catch (err) {
        caught = err;
      }

      assert.strictEqual(caught, thrown);
      assert.strictEqual((caught as Error).stack, 42);
    }
    finally {
      await stopHTTPServer(server);
    }
  });
});
