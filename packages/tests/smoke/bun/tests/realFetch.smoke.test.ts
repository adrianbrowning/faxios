import { describe, expect, test } from "bun:test";
import faxios from "faxios";

// The runtime's real fetch against a local Bun.serve: no `env.fetch` mock, so the request,
// abort and stream handling are Bun's own.
const serve = (fetch: (req: Request) => Promise<Response> | Response) =>
  Bun.serve({ port: 0, hostname: "127.0.0.1", fetch });

describe("real fetch against Bun.serve", () => {
  test("GET resolves the JSON body", async () => {
    const server = serve(req => Response.json({ method: req.method, path: new URL(req.url).pathname }));
    try {
      const response = await faxios.get(new URL("/users", server.url).href);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.data).toEqual({ method: "GET", path: "/users" });
    }
    finally {
      await server.stop(true);
    }
  });

  test("a ReadableStream body is streamed to the server in full", async () => {
    const server = serve(async req => {
      const text = await req.text();
      return Response.json({ bytes: text.length, text });
    });
    const chunks = [ "first-", "second-", "x".repeat(64 * 1024) ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });
    try {
      const response = await faxios.post(server.url.href, body, { headers: { "Content-Type": "application/octet-stream" } });

      expect(response.data).toEqual({ bytes: chunks.join("").length, text: chunks.join("") });
    }
    finally {
      await server.stop(true);
    }
  });

  test("aborting after the first body chunk rejects with ERR_CANCELED", async () => {
    const { promise: released, resolve: release } = Promise.withResolvers<void>();
    const server = serve(() => new Response(new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode("first"));
        // The rest of the body never comes before the client aborts.
        await released;
        controller.close();
      },
    }), { headers: { "Content-Type": "text/plain" } }));
    const controller = new AbortController();
    const loaded: Array<number> = [];
    try {
      const err = await faxios.get(server.url.href, {
        responseType: "text",
        signal: controller.signal,
        onDownloadProgress: event => {
          loaded.push(event.loaded);
          controller.abort();
        },
      }).catch((e: unknown) => e);

      expect(loaded[0]).toBe("first".length);
      expect(faxios.isCancel(err)).toBe(true);
      expect(err).toMatchObject({ code: "ERR_CANCELED" });
    }
    finally {
      release();
      await server.stop(true);
    }
  });

  test("a server that never answers rejects with ETIMEDOUT after `timeout`", async () => {
    const { promise: released, resolve: release } = Promise.withResolvers<void>();
    const server = serve(async () => {
      await released;
      return new Response("late");
    });
    try {
      const err = await faxios.get(server.url.href, { timeout: 100 }).catch((e: unknown) => e);

      expect(faxios.isFaxiosError(err)).toBe(true);
      expect(faxios.isCancel(err)).toBe(false);
      expect(err).toMatchObject({ code: "ETIMEDOUT" });
    }
    finally {
      release();
      await server.stop(true);
    }
  });

  test("onDownloadProgress reports increasing loaded up to the Content-Length", async () => {
    // Bun.serve sends a streamed body chunked, without Content-Length, so the body is a sized
    // string, large enough to arrive over several reads.
    const body = "x".repeat(4 * 1024 * 1024);
    const server = serve(() => new Response(body, { headers: { "Content-Type": "application/octet-stream" } }));
    const events: Array<{ loaded: number; total: number | undefined; }> = [];
    try {
      const response = await faxios.get(server.url.href, {
        responseType: "text",
        onDownloadProgress: event => {
          events.push({ loaded: event.loaded, total: event.total });
        },
      });

      expect(response.data).toBe(body);
      expect(events.length).toBeGreaterThanOrEqual(2);
      const loaded = events.map(event => event.loaded);
      expect(loaded).toEqual([ ...loaded ].sort((a, b) => a - b));
      expect(new Set(loaded).size).toBe(loaded.length);
      expect(events.at(-1)).toEqual({ loaded: body.length, total: body.length });
    }
    finally {
      await server.stop(true);
    }
  });

  test("a refused connection rejects with ERR_NETWORK", async () => {
    const server = serve(() => new Response("unreachable"));
    const url = server.url.href;
    try {
      expect(url).toStartWith("http://127.0.0.1:");
    }
    finally {
      // Stopped before the request, so nothing listens on the port.
      await server.stop(true);
    }

    const err = await faxios.get(url).catch((e: unknown) => e);

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err).toMatchObject({ code: "ERR_NETWORK" });
  });
});
