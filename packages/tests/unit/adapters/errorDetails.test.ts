import assert from "node:assert";
import type { AddressInfo } from "node:net";
import net from "node:net";
import { describe, it, vi } from "vitest";
import faxios from "#src/index.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";

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
      const e = err as Error & { code: string; isFaxiosError: boolean; };
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

describe("adapters - transport error codes", () => {
  const rejection = async (promise: Promise<unknown>) => {
    const err: unknown = await promise.then(
      () => { throw new Error("request unexpectedly resolved"); },
      (e: unknown) => e
    );
    assert.strictEqual(faxios.isFaxiosError(err), true, "isFaxiosError should be true");
    return err as FaxiosError;
  };

  it("rejects a relative URL outside the browser with ERR_INVALID_URL and a baseURL hint", async () => {
    const fetch = vi.fn(async () => new Response("ok"));
    const err = await rejection(faxios.create({ env: { fetch } }).get("/user?ID=12345"));
    assert.strictEqual(err.code, FaxiosError.ERR_INVALID_URL);
    assert.match(err.message, /baseURL/);
    assert.ok(err.cause instanceof TypeError, "the parse failure should be on error.cause");
    assert.strictEqual(fetch.mock.calls.length, 0);
  });

  it("rejects a Request the runtime refuses to build with ERR_BAD_REQUEST", async () => {
    const fetch = vi.fn(async () => new Response("ok"));
    const err = await rejection(
      faxios.create({ env: { fetch } }).request({ url: "http://example.test/", method: "get", data: "body" })
    );
    assert.strictEqual(err.code, FaxiosError.ERR_BAD_REQUEST);
    assert.strictEqual(fetch.mock.calls.length, 0);
  });

  it("rejects a response body that fails mid-stream with ERR_NETWORK", async () => {
    const terminated = new TypeError("terminated");
    const fetch = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("partial"));
        controller.error(terminated);
      },
    })));
    const err = await rejection(faxios.create({ env: { fetch } }).get("http://example.test/"));
    assert.strictEqual(err.code, FaxiosError.ERR_NETWORK);
    assert.strictEqual(err.cause, terminated);
  });
});
