import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { describe, it } from "vitest";
import faxios from "#src/index.ts";
import { startHTTPServer, stopHTTPServer } from "../../setup/server.js";

describe("core::methodHeaderBuckets", () => {
  it("should apply the OPTIONS header bucket without leaking it as a header", async () => {
    let received: Record<string, string | Array<string> | undefined> = {};

    const server = await startHTTPServer((req, res) => {
      received = req.headers;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
    const { port } = server.address() as AddressInfo;

    try {
      const instance = faxios.create();
      instance.defaults.headers = {
        ...instance.defaults.headers,
        options: { "X-Bucket": "applied" },
      } as typeof instance.defaults.headers;

      const response = await instance.options(`http://127.0.0.1:${port}/`);

      assert.strictEqual(response.status, 200);
      assert.strictEqual(received["x-bucket"], "applied");
      assert.strictEqual(received["options"], undefined);
    }
    finally {
      await stopHTTPServer(server);
    }
  });
});
