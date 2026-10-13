import assert from "node:assert";
import { getEventListeners } from "node:events";
import type { ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it, vi } from "vitest";
import faxios from "#src/index.js";
import { startHTTPServer, stopHTTPServer } from "../../setup/server.js";

const urlOf = (server: { address: () => AddressInfo | null | string; }) => `http://localhost:${(server.address() as AddressInfo).port}/`;

const client = faxios.create({ allowAbsoluteUrls: true });

// A handler that keeps sending 1 KiB chunks until its connection closes.
// `closed` resolves when the server sees the socket close.
const endlessResponse = () => {
  const { promise: closed, resolve: resolveClosed } = Promise.withResolvers<void>();
  const chunk = "B".repeat(1024);
  const handler = (_req: unknown, res: ServerResponse) => {
    res.setHeader("Transfer-Encoding", "chunked");
    res.on("close", () => resolveClosed());
    const writeNext = (): void => {
      if (!res.destroyed) res.write(chunk, () => setImmediate(writeNext));
    };
    writeNext();
  };
  return { closed, handler };
};

describe("fetch adapter request cleanup", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("after a maxContentLength rejection", () => {
    for (const withSignal of [ false, true ]) {
      it(`closes the connection ${withSignal ? "with" : "without"} a caller signal`, async () => {
        const { closed, handler } = endlessResponse();
        const server = await startHTTPServer(handler);
        try {
          const controller = new AbortController();
          await assert.rejects(
            client.get(urlOf(server), {
              maxContentLength: 4096,
              ...(withSignal ? { signal: controller.signal } : {}),
            }),
            { code: "ERR_BAD_RESPONSE" }
          );
          // Without cleanup the server keeps streaming and this never resolves.
          await closed;
          if (withSignal) {
            assert.strictEqual(getEventListeners(controller.signal, "abort").length, 0);
          }
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    }
  });

  it("cancels and unlocks an upload stream that trips maxBodyLength", async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(512));
      },
      cancel() {
        cancelled = true;
      },
    });
    const server = await startHTTPServer((req, res) => {
      req.on("error", () => {});
      req.resume();
      req.on("end", () => res.end("ok"));
    });
    try {
      await assert.rejects(
        client.post(urlOf(server), source, {
          maxBodyLength: 1024,
          headers: { "Content-Type": "application/octet-stream" },
        }),
        { code: "ERR_BAD_REQUEST" }
      );
      assert.strictEqual(cancelled, true, "source stream should be cancelled");
      assert.strictEqual(source.locked, false, "source stream should be unlocked");
    }
    finally {
      await stopHTTPServer(server);
    }
  });

  describe("stream response without a body", () => {
    for (const [ method, status ] of [[ "get", 204 ], [ "head", 200 ]] as const) {
      it(`removes the caller signal listener and clears the timeout (${method.toUpperCase()} ${status})`, async () => {
        const server = await startHTTPServer((_req, res) => {
          res.statusCode = status;
          res.end();
        });
        try {
          const controller = new AbortController();
          let fetchSignal: AbortSignal | undefined;
          const response = await client.request({
            url: urlOf(server),
            method,
            responseType: "stream",
            signal: controller.signal,
            timeout: 60000,
            env: {
              fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
                fetchSignal = init?.signal ?? undefined;
                return fetch(input, init);
              },
            },
          });
          assert.strictEqual(response.status, status);
          assert.strictEqual(response.data, null);
          // Cleanup is deferred to the next tick.
          await new Promise(resolve => setImmediate(resolve));
          assert.strictEqual(getEventListeners(controller.signal, "abort").length, 0);
          // The timer is gone: advancing past the timeout doesn't abort the request signal.
          vi.useFakeTimers();
          vi.advanceTimersByTime(60001);
          assert.ok(fetchSignal);
          assert.strictEqual(fetchSignal.aborted, false);
        }
        finally {
          vi.useRealTimers();
          await stopHTTPServer(server);
        }
      });
    }
  });

  it("runs feature detection once per Request/Response pair, not once per env.fetch", async () => {
    let detections = 0;
    // `env.Response` is typed to accept any arguments.
    class CountingResponse extends Response {
      constructor(body?: unknown, init?: unknown) {
        super(body as BodyInit | null | undefined, init as ResponseInit | undefined);
        detections++;
      }
    }
    for (let i = 0; i < 1000; i++) {
      // A fresh fetch per request, like SvelteKit's `event.fetch`.
       
      const { data } = await client.get("http://localhost/", {
        env: {
          fetch: async () => new Response("ok"),
          Request,
          Response: CountingResponse,
        },
      });
      assert.strictEqual(data, "ok");
    }
    // The adapter only constructs `env.Response` while detecting features.
    assert.strictEqual(detections, 1);
  });

  describe("stream response body that stalls", () => {
    // Behaves like fetch: aborting the request signal errors the body with the signal's reason.
    const stallingFetch = (sent: { signal?: AbortSignal; }) => async (_input: unknown, init?: RequestInit) => {
      const signal = init!.signal!;
      sent.signal = signal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("first"));
          signal.addEventListener("abort", () => controller.error(signal.reason));
        },
      });
      return new Response(body);
    };

    it("is aborted by timeout while the body is read", async () => {
      vi.useFakeTimers();
      const sent: { signal?: AbortSignal; } = {};
      const { data } = await client.get<ReadableStream<Uint8Array>>("http://localhost/", {
        responseType: "stream",
        timeout: 1000,
        env: { fetch: stallingFetch(sent) },
      });
      const reader = data.getReader();
      assert.strictEqual(new TextDecoder().decode((await reader.read()).value), "first");
      const pending = reader.read();
      const rejected = assert.rejects(pending, { code: "ETIMEDOUT" });
      await vi.advanceTimersByTimeAsync(1000);
      await rejected;
      assert.strictEqual(vi.getTimerCount(), 0);
    });

    it("keeps the timeout armed while the body is open and clears it once the body ends", async () => {
      vi.useFakeTimers();
      const { promise: gate, resolve: open } = Promise.withResolvers<void>();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("first "));
        },
        async pull(controller) {
          await gate;
          controller.enqueue(new TextEncoder().encode("last"));
          controller.close();
        },
      });
      const { data } = await client.get<ReadableStream<Uint8Array>>("http://localhost/", {
        responseType: "stream",
        timeout: 1000,
        env: { fetch: async () => new Response(body) },
      });
      assert.strictEqual(vi.getTimerCount(), 1);
      open();
      assert.strictEqual(await new Response(data).text(), "first last");
      assert.strictEqual(vi.getTimerCount(), 0);
    });

    it("is aborted by the caller signal while the body is read, with a timeout set", async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const sent: { signal?: AbortSignal; } = {};
      const { data } = await client.get<ReadableStream<Uint8Array>>("http://localhost/", {
        responseType: "stream",
        timeout: 60_000,
        signal: controller.signal,
        env: { fetch: stallingFetch(sent) },
      });
      const reader = data.getReader();
      await reader.read();
      const pending = reader.read();
      controller.abort(new Error("user left"));
      await assert.rejects(pending, { code: "ERR_CANCELED", message: "user left" });
      await vi.advanceTimersByTimeAsync(0);
      assert.strictEqual(vi.getTimerCount(), 0);
      assert.strictEqual(getEventListeners(controller.signal, "abort").length, 0);
    });

    it("is aborted by the caller signal while the body is read, and drops its listener", async () => {
      const controller = new AbortController();
      const sent: { signal?: AbortSignal; } = {};
      const { data } = await client.get<ReadableStream<Uint8Array>>("http://localhost/", {
        responseType: "stream",
        signal: controller.signal,
        env: { fetch: stallingFetch(sent) },
      });
      const reader = data.getReader();
      await reader.read();
      // Still armed while the body is open.
      assert.strictEqual(getEventListeners(controller.signal, "abort").length, 1);
      const pending = reader.read();
      controller.abort();
      await assert.rejects(pending, { code: "ERR_CANCELED" });
      await new Promise(resolve => setImmediate(resolve));
      assert.strictEqual(getEventListeners(controller.signal, "abort").length, 0);
    });

    it("releases the caller signal when the body is cancelled", async () => {
      const controller = new AbortController();
      const sent: { signal?: AbortSignal; } = {};
      const { data } = await client.get<ReadableStream<Uint8Array>>("http://localhost/", {
        responseType: "stream",
        signal: controller.signal,
        env: { fetch: stallingFetch(sent) },
      });
      await data.cancel();
      await new Promise(resolve => setImmediate(resolve));
      assert.strictEqual(getEventListeners(controller.signal, "abort").length, 0);
    });
  });
});
