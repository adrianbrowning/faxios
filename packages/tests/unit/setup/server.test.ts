import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it, vi } from "vitest";
import type { ExtendedServer } from "../../setup/server.js";
import { startHTTPServer, stopHTTPServer } from "../../setup/server.js";

describe("setup/server", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("startHTTPServer rejects with EADDRINUSE when the port is taken", async () => {
    const holder = await startHTTPServer((_req, res) => res.end("OK"));

    try {
      const { port } = holder.address() as AddressInfo;

      await assert.rejects(
        async () => startHTTPServer({ port }),
        (err: NodeJS.ErrnoException) => {
          assert.strictEqual(err.code, "EADDRINUSE");
          return true;
        }
      );
    }
    finally {
      await stopHTTPServer(holder);
    }
  });

  it("startHTTPServer listens on the IPv4 loopback address", async () => {
    const server = await startHTTPServer((_req, res) => res.end("OK"));

    try {
      assert.strictEqual((server.address() as AddressInfo).address, "127.0.0.1");
    }
    finally {
      await stopHTTPServer(server);
    }
  });

  it("stopHTTPServer rejects when the server does not close before the timeout", async () => {
    vi.useFakeTimers();
    const unclosable = { close() {}, closeAllConnections() {} } as unknown as ExtendedServer;

    const stopped = stopHTTPServer(unclosable, 100);
    const assertion = assert.rejects(stopped, /did not close within 100ms/);

    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });
});
