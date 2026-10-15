import { assertEquals, assertStringIncludes } from "@std/assert";
import faxios from "faxios";

// The runtime's real fetch against a local Deno.serve: no `env.fetch` mock, so the request,
// abort and stream handling are Deno's own.
const serve = (handler: (req: Request) => Promise<Response> | Response) =>
  Deno.serve({ port: 0, hostname: "127.0.0.1", onListen() {} }, handler);

const urlOf = (server: Deno.HttpServer<Deno.NetAddr>, path = "/") => `http://127.0.0.1:${server.addr.port}${path}`;

Deno.test("real fetch: GET resolves the JSON body", async () => {
  const server = serve(req => Response.json({ method: req.method, path: new URL(req.url).pathname }));
  try {
    const response = await faxios.get(urlOf(server, "/users"));

    assertEquals(response.status, 200);
    assertStringIncludes(String(response.headers.get("content-type")), "application/json");
    assertEquals(response.data, { method: "GET", path: "/users" });
  }
  finally {
    await server.shutdown();
  }
});

Deno.test("real fetch: a ReadableStream body is streamed to the server in full", async () => {
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
    const response = await faxios.post(urlOf(server), body, { headers: { "Content-Type": "application/octet-stream" } });

    assertEquals(response.data, { bytes: chunks.join("").length, text: chunks.join("") });
  }
  finally {
    await server.shutdown();
  }
});

Deno.test("real fetch: aborting after the first body chunk rejects with ERR_CANCELED", async () => {
  const { promise: released, resolve: release } = Promise.withResolvers<void>();
  let bodyEnded = false;
  const server = serve(() => new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(new TextEncoder().encode("first"));
      // The rest of the body never comes before the client aborts; `deno test` has no test
      // timeout, so a broken abort ends the body after 5 s and fails the assertions instead.
      await released;
      bodyEnded = true;
      controller.close();
    },
  }), { headers: { "Content-Type": "text/plain" } }));
  const controller = new AbortController();
  // Real timers on purpose: real fetch needs the real event loop, so fake timers can't apply.
  const fallback = setTimeout(release, 5000);
  const loaded: Array<number> = [];
  try {
    const err = await faxios.get(urlOf(server), {
      responseType: "text",
      signal: controller.signal,
      onDownloadProgress: event => {
        loaded.push(event.loaded);
        controller.abort();
      },
    }).catch((e: unknown) => e);

    assertEquals(loaded[0], "first".length);
    // The abort stopped the body read: the request didn't wait for the body to end.
    assertEquals(bodyEnded, false);
    assertEquals(faxios.isCancel(err), true);
    assertEquals(faxios.isFaxiosError(err) ? err.code : undefined, "ERR_CANCELED");
  }
  finally {
    clearTimeout(fallback);
    release();
    await server.shutdown();
  }
});

Deno.test("real fetch: a server that never answers rejects with ETIMEDOUT after `timeout`", async () => {
  const { promise: released, resolve: release } = Promise.withResolvers<void>();
  // Real timers on purpose: real fetch and Deno.serve need the real event loop, so the 100 ms
  // `timeout` runs on real time. `deno test` has no test timeout: a timeout that never fires gets the late answer and fails.
  const fallback = setTimeout(release, 5000);
  const server = serve(async () => {
    await released;
    return new Response("late");
  });
  try {
    const err = await faxios.get(urlOf(server), { timeout: 100 }).catch((e: unknown) => e);

    assertEquals(faxios.isFaxiosError(err), true);
    assertEquals(faxios.isCancel(err), false);
    assertEquals(faxios.isFaxiosError(err) ? err.code : undefined, "ETIMEDOUT");
  }
  finally {
    clearTimeout(fallback);
    release();
    await server.shutdown();
  }
});

Deno.test("real fetch: onDownloadProgress reports increasing loaded up to the Content-Length", async () => {
  // A sized body (Content-Length set), large enough to arrive over several reads. Deno.serve
  // gzips compressible types, which drops Content-Length, so the type is octet-stream.
  const body = "x".repeat(4 * 1024 * 1024);
  const server = serve(() => new Response(body, { headers: { "Content-Type": "application/octet-stream" } }));
  const events: Array<{ loaded: number; total: number | undefined; }> = [];
  try {
    const response = await faxios.get(urlOf(server), {
      responseType: "text",
      onDownloadProgress: event => {
        events.push({ loaded: event.loaded, total: event.total });
      },
    });

    assertEquals(response.data, body);
    assertEquals(events.length >= 2, true, `expected several progress events, got ${events.length}`);
    const loaded = events.map(event => event.loaded);
    assertEquals(loaded, [ ...loaded ].sort((a, b) => a - b));
    assertEquals(new Set(loaded).size, loaded.length);
    assertEquals(events.at(-1), { loaded: body.length, total: body.length });
  }
  finally {
    await server.shutdown();
  }
});

Deno.test("real fetch: a refused connection rejects with ERR_NETWORK", async () => {
  const server = serve(() => new Response("unreachable"));
  const url = urlOf(server);
  try {
    assertStringIncludes(url, "http://127.0.0.1:");
  }
  finally {
    // Stopped before the request, so nothing listens on the port.
    await server.shutdown();
  }

  const err = await faxios.get(url).catch((e: unknown) => e);

  assertEquals(faxios.isFaxiosError(err), true);
  assertEquals(faxios.isFaxiosError(err) ? err.code : undefined, "ERR_NETWORK");
});
