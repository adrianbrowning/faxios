import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { describe, it } from "vitest";
import faxios from "#src/index.ts";
import { startHTTPServer, stopHTTPServer } from "../../setup/server.js";

describe("core::interceptors", () => {
  describe("synchronous request interceptors", () => {
    it("should reject without dispatching when a synchronous interceptor throws", async () => {
      let requestsReceived = 0;

      const server = await startHTTPServer((_req, res) => {
        requestsReceived++;
        res.setHeader("Content-Type", "application/json");
        res.end("{}");
      });
      const { port } = server.address() as AddressInfo;

      try {
        const instance = faxios.create();
        const veto = new Error("interceptor veto");

        instance.interceptors.request.use(
          () => {
            throw veto;
          },
          undefined,
          { synchronous: true }
        );

        await assert.rejects(
          instance.get(`http://127.0.0.1:${port}/`),
          (err: unknown) => err === veto
        );

        assert.strictEqual(requestsReceived, 0);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should dispatch only after a rejection handler recovers from the throw", async () => {
      const requestOrder: Array<string> = [];

      const server = await startHTTPServer((_req, res) => {
        requestOrder.push("dispatched");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      });
      const { port } = server.address() as AddressInfo;

      try {
        const instance = faxios.create();
        // Gate the recovery so "dispatch waits for the thenable" is asserted
        // against an observable signal rather than an elapsed duration.
        const recovery = Promise.withResolvers<void>();
        let thrownConfig: unknown;

        instance.interceptors.request.use(
          config => {
            thrownConfig = config;
            throw new Error("needs recovery");
          },
          async error => {
            assert.strictEqual((error as Error).message, "needs recovery");
            await recovery.promise;
            requestOrder.push("recovered");
            return thrownConfig;
          },
          { synchronous: true }
        );

        const pending = instance.get<{ ok: boolean; }>(
          `http://127.0.0.1:${port}/`
        );

        assert.deepStrictEqual(requestOrder, []);

        recovery.resolve();
        const response = await pending;

        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(response.data, { ok: true });
        assert.deepStrictEqual(requestOrder, [ "recovered", "dispatched" ]);
      }
      finally {
        await stopHTTPServer(server);
      }
    });
  });
});
