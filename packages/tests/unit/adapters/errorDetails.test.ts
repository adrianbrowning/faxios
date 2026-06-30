import assert from "node:assert";
import type { AddressInfo } from "node:net";
import net from "node:net";
import { describe, it } from "vitest";
import faxios from "#src/index.js";

const getClosedPort = async () =>
  new Promise(resolve => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });

describe("adapters - network-error details", () => {
  it("should expose ECONNREFUSED and set error.cause on connection refusal", async () => {
    const port = await getClosedPort();

    try {
      await (
        faxios as unknown as {
          get: (url: string, config?: unknown) => Promise<unknown>;
        }
      ).get(`http://127.0.0.1:${port}`, { timeout: 500 });
      assert.fail("request unexpectedly succeeded");
    }
    catch (err) {
      const e = err as Error & { isFaxiosError: boolean; code: string; };
      assert.ok(e instanceof Error, "should be an Error");
      assert.strictEqual(e.isFaxiosError, true, "isFaxiosError should be true");

      // The fetch adapter standardizes transport failures to ERR_NETWORK and
      // preserves the underlying OS error on error.cause.
      assert.strictEqual(e.code, "ERR_NETWORK");
      assert.ok("cause" in e, "error.cause should exist");
      assert.ok(e.cause instanceof Error, "cause should be an Error");

      assert.strictEqual(
        (e.cause as NodeJS.ErrnoException).code,
        "ECONNREFUSED"
      );

      assert.strictEqual(typeof e.message, "string");
    }
  });
});
