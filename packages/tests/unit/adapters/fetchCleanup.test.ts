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
    // Middleware makes core hold the request open for a stream body; with no body there is none.
    const passThrough = faxios.create({ allowAbsoluteUrls: true }).use(async (ctx, next) => next(ctx));

    for (const [ method, status ] of [[ "get", 204 ], [ "head", 200 ]] as const) {
      const request = async (signal: AbortSignal, timeout?: number) => passThrough.request({
        url: "http://localhost/",
        method,
        responseType: "stream",
        signal,
        timeout,
        env: { fetch: async () => new Response(null, { status }) },
      });

      it(`clears the timeout once the request settles (${method.toUpperCase()} ${status})`, async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const response = await request(controller.signal, 60_000);
        assert.strictEqual(response.status, status);
        assert.strictEqual(response.data, null);
        // Runs the cleanup the adapter defers, without waiting on a real tick.
        await vi.advanceTimersByTimeAsync(0);
        assert.strictEqual(vi.getTimerCount(), 0);
      });

      it(`removes the caller signal listener once the request settles (${method.toUpperCase()} ${status})`, async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const response = await request(controller.signal);
        assert.strictEqual(response.data, null);
        await vi.advanceTimersByTimeAsync(0);
        assert.strictEqual(getEventListeners(controller.signal, "abort").length, 0);
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

    it("is aborted by timeout or the caller signal while the body is read, behind middleware that returns its own response", async () => {
      vi.useFakeTimers();
      const copying = faxios.create({ allowAbsoluteUrls: true }).use(async (ctx, next) => ({ ...(await next(ctx)) }));
      for (const by of [ "timeout", "signal" ] as const) {
        const controller = new AbortController();
        const { data } = await copying.get<ReadableStream<Uint8Array>>("http://localhost/", {
          responseType: "stream",
          timeout: 1000,
          signal: controller.signal,
          env: { fetch: stallingFetch({}) },
        });
        const reader = data.getReader();
        await reader.read();
        const rejected = assert.rejects(reader.read(), { code: by === "timeout" ? "ETIMEDOUT" : "ERR_CANCELED" });
        if (by === "timeout") await vi.advanceTimersByTimeAsync(1000);
        else controller.abort();
        await rejected;
        assert.strictEqual(vi.getTimerCount(), 0);
        assert.strictEqual(getEventListeners(controller.signal, "abort").length, 0);
      }
    });

    it("is aborted by timeout while the body is read, behind middleware that passes on a new ctx.state", async () => {
      vi.useFakeTimers();
      const restating = faxios.create({ allowAbsoluteUrls: true }).use(async (ctx, next) => next({ ...ctx, state: { ...ctx.state } }));
      const { data } = await restating.get<ReadableStream<Uint8Array>>("http://localhost/", {
        responseType: "stream",
        timeout: 1000,
        env: { fetch: stallingFetch({}) },
      });
      const reader = data.getReader();
      await reader.read();
      const rejected = assert.rejects(reader.read(), { code: "ETIMEDOUT" });
      await vi.advanceTimersByTimeAsync(1000);
      await rejected;
      assert.strictEqual(vi.getTimerCount(), 0);
    });

    it("is aborted by timeout while the body is read, behind middleware that rebuilds the context literal", async () => {
      vi.useFakeTimers();
      const rebuilding = faxios.create({ allowAbsoluteUrls: true }).use(async (ctx, next) => next({
        attempt: ctx.attempt,
        capabilities: ctx.capabilities,
        config: ctx.config,
        instanceBaseURL: ctx.instanceBaseURL,
        state: ctx.state,
      }));
      const { data } = await rebuilding.get<ReadableStream<Uint8Array>>("http://localhost/", {
        responseType: "stream",
        timeout: 1000,
        env: { fetch: stallingFetch({}) },
      });
      const reader = data.getReader();
      await reader.read();
      const rejected = assert.rejects(reader.read(), { code: "ETIMEDOUT" });
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

  describe("stream response with an error status", () => {
    const notFound = JSON.stringify({ error: "not found" });
    const rejection = async (config: Parameters<typeof client.get>[1], url = "http://localhost/") =>
      client.get(url, { responseType: "stream", ...config }).then(
        () => assert.fail("expected the 404 to reject"),
        (err: unknown) => err as { code?: string; response?: { data: ReadableStream<Uint8Array>; status: number; }; }
      );

    it("rejects with ERR_BAD_REQUEST and hands over the server's body", async () => {
      const server = await startHTTPServer((_req, res) => {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(notFound);
      });
      try {
        const err = await rejection({}, urlOf(server));
        assert.strictEqual(err.code, "ERR_BAD_REQUEST");
        assert.strictEqual(err.response?.status, 404);
        assert.strictEqual(await new Response(err.response.data).text(), notFound);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("keeps the timeout and caller listener while the body is open and clears them once it is read", async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      // Ends only when the gate opens, so the body is still open when the request rejects.
      const { promise: gate, resolve: open } = Promise.withResolvers<void>();
      const body = new ReadableStream<Uint8Array>({
        async pull(stream) {
          await gate;
          stream.enqueue(new TextEncoder().encode(notFound));
          stream.close();
        },
      });
      const err = await rejection({
        timeout: 60_000,
        signal: controller.signal,
        env: { fetch: async () => new Response(body, { status: 404 }) },
      });
      assert.strictEqual(vi.getTimerCount(), 1);
      assert.strictEqual(getEventListeners(controller.signal, "abort").length, 1);
      open();
      assert.strictEqual(await new Response(err.response!.data).text(), notFound);
      await vi.advanceTimersByTimeAsync(0);
      assert.strictEqual(vi.getTimerCount(), 0);
      assert.strictEqual(getEventListeners(controller.signal, "abort").length, 0);
    });

    it("is aborted by timeout while the body is open", async () => {
      vi.useFakeTimers();
      // Behaves like fetch: sends nothing, and aborting the request signal errors the body.
      const stallingNotFound = async (_input: unknown, init?: RequestInit) => {
        const signal = init!.signal!;
        const body = new ReadableStream<Uint8Array>({
          start(stream) {
            signal.addEventListener("abort", () => stream.error(signal.reason));
          },
        });
        return new Response(body, { status: 404 });
      };
      const err = await rejection({ timeout: 1000, env: { fetch: stallingNotFound } });
      const rejected = assert.rejects(err.response!.data.getReader().read(), { code: "ETIMEDOUT" });
      await vi.advanceTimersByTimeAsync(1000);
      await rejected;
      assert.strictEqual(vi.getTimerCount(), 0);
    });

    it("closes the connection when the body is cancelled", async () => {
      const { closed, handler } = endlessResponse();
      const server = await startHTTPServer((req, res) => {
        res.statusCode = 503;
        handler(req, res);
      });
      try {
        const err = await rejection({}, urlOf(server));
        assert.strictEqual(err.code, "ERR_BAD_RESPONSE");
        await err.response!.data.cancel();
        // Without the release the server keeps streaming and this never resolves.
        await closed;
      }
      finally {
        await stopHTTPServer(server);
      }
    });
  });

  describe("stream body cancelled while a read of a stalled source is pending", () => {
    // Sends nothing: with highWaterMark 0 the source is pulled only for a pending read.
    const stalledBody = () => {
      const { promise: reading, resolve: onRead } = Promise.withResolvers<void>();
      const cancelled: Array<unknown> = [];
      const body = new ReadableStream<Uint8Array>(
        {
          pull() {
            onRead();
          },
          cancel(reason) {
            cancelled.push(reason);
          },
        },
        { highWaterMark: 0 }
      );
      return { body, cancelled, reading };
    };

    // Under fake timers: reports a hang once the clock passes 1s, instead of waiting for the test timeout.
    const settlesInTime = async (promise: Promise<unknown>) => {
      const { promise: deadline, resolve: hung } = Promise.withResolvers<string>();
      setTimeout(hung, 1000, "hung");
      const result = Promise.race([ promise.then(() => "settled"), deadline ]);
      await vi.advanceTimersByTimeAsync(1000);
      return result;
    };

    for (const middlewares of [ 0, 3 ]) {
      for (const timeout of [ undefined, 60_000 ]) {
        it(`settles and cancels the response source (${middlewares} middlewares, ${timeout ? "with" : "without"} timeout)`, async () => {
          vi.useFakeTimers();
          const { body, cancelled, reading } = stalledBody();
          const api = faxios.create({ allowAbsoluteUrls: true });
          for (let i = 0; i < middlewares; i++) api.use(async (ctx, next) => next(ctx));
          const controller = new AbortController();
          const { data } = await api.get<ReadableStream<Uint8Array>>("http://localhost/", {
            responseType: "stream",
            signal: controller.signal,
            timeout,
            env: { fetch: async () => new Response(body) },
          });
          await reading;
          const reason = new Error("done reading");
          assert.strictEqual(await settlesInTime(data.cancel(reason)), "settled");
          assert.deepStrictEqual(cancelled, [ reason ]);
          assert.strictEqual(vi.getTimerCount(), 0);
          assert.strictEqual(getEventListeners(controller.signal, "abort").length, 0);
        });
      }
    }

    it("cancels the upload source when fetch cancels the tracked request body", async () => {
      vi.useFakeTimers();
      const { body: source, cancelled, reading } = stalledBody();
      let bodyCancel: Promise<void> | undefined;
      // Like a fetch that cancels the request body when the request is aborted.
      const cancellingFetch = async (input: unknown, init?: RequestInit) => {
        // With onUploadProgress the adapter sends the tracked stream as the Request body.
        const body = (input as Request).body!;
        const signal = init!.signal!;
        const reader = body.getReader();
        void reader.read();
        const { promise, reject } = Promise.withResolvers<Response>();
        const onAbort = () => {
          bodyCancel = reader.cancel(signal.reason);
          reject(signal.reason);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        return promise;
      };
      const controller = new AbortController();
      const request = assert.rejects(
        client.post("http://localhost/", source, {
          signal: controller.signal,
          headers: { "Content-Type": "application/octet-stream" },
          onUploadProgress: () => {},
          env: { fetch: cancellingFetch },
        }),
        { code: "ERR_CANCELED" }
      );
      assert.strictEqual(await settlesInTime(reading), "settled");
      controller.abort(new Error("user left"));
      await request;
      assert.ok(bodyCancel);
      assert.strictEqual(await settlesInTime(bodyCancel), "settled");
      assert.strictEqual(cancelled.length, 1);
      assert.strictEqual(source.locked, false);
    });
  });
});
