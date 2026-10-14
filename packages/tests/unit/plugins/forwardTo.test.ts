import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it, vi } from "vitest";
import { z } from "zod";
import faxios, { FaxiosError } from "#src/index.ts";
import { forwardTo } from "#src/lib/plugins/forwardTo.ts";
import { retry } from "#src/lib/plugins/retry.ts";
import { startHTTPServer, stopHTTPServer } from "../../setup/server.js";

const GATEWAY = "http://gateway.local:8888/";

type Sent = { forwardTo: null | string; init: RequestInit | undefined; url: string; };

// A user env.fetch that records where each call went, its init and the forward header.
function recordingFetch(statuses: Array<number> = [ 200 ]) {
  const sent: Array<Sent> = [];
  const fetch = async (input: Request | string | URL, init?: RequestInit) => {
    const url = typeof input === "object" && "url" in input ? input.url : String(input);
    sent.push({ url, init, forwardTo: new Headers(init?.headers).get("X-Forward-To") });
    return new Response("ok", { status: statuses[Math.min(sent.length, statuses.length) - 1] });
  };
  return { fetch, sent };
}

const isCode = (code: string) => (err: unknown) => err instanceof FaxiosError && err.code === code;

describe("plugins::forwardTo", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("passes null-prototype ctx.config and env to middleware installed after it", async () => {
    const protos: Array<unknown> = [];
    const { fetch } = recordingFetch();
    const api = faxios.create({ baseURL: "https://api.example.com", env: { fetch } }).use(forwardTo(GATEWAY))
      .use(async (ctx, next) => {
        protos.push(Object.getPrototypeOf(ctx.config), Object.getPrototypeOf(ctx.config.env));
        return next(ctx);
      });

    await api.get("/x");

    assert.deepStrictEqual(protos, [ null, null ]);
  });

  it("sends the request to the gateway with the final URL in X-Forward-To", async () => {
    const received: Array<{ forwardTo: string | undefined; url: string | undefined; }> = [];
    const gateway = await startHTTPServer((req, res) => {
      const value = req.headers["x-forward-to"];
      received.push({ url: req.url, forwardTo: typeof value === "string" ? value : undefined });
      res.end("ok");
    });
    try {
      const api = faxios.create({ baseURL: "https://api.example.com", params: { utk: "U1" } })
        .use(forwardTo(`http://127.0.0.1:${(gateway.address() as AddressInfo).port}/gw`));

      const response = await api.get("/v1/accounts/{account}/profiles", {
        pathParams: { account: "acme co" },
        params: { limit: " 5 " },
        paramsSchema: z.object({ limit: z.string().transform(s => s.trim()), utk: z.string() }),
      });

      assert.strictEqual(response.data, "ok");
      assert.deepStrictEqual(received, [{
        url: "/gw",
        forwardTo: "https://api.example.com/v1/accounts/acme%20co/profiles?limit=5&utk=U1",
      }]);
    }
    finally {
      await stopHTTPServer(gateway);
    }
  });

  it("forwards a buffered body with its Content-Length and a stream body as a stream", async () => {
    const received: Array<{ body: string; contentLength: string | undefined; }> = [];
    const gateway = await startHTTPServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => {
        body += chunk;
      });
      req.on("end", () => {
        received.push({ body, contentLength: req.headers["content-length"] });
        res.end("ok");
      });
    });
    try {
      const api = faxios.create({ baseURL: "https://api.example.com" })
        .use(forwardTo(`http://127.0.0.1:${(gateway.address() as AddressInfo).port}/gw`));
      const encoder = new TextEncoder();

      await api.post("/items", { name: "a" });
      await api.post("/items", new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("s1"));
          controller.enqueue(encoder.encode("s2"));
          controller.close();
        },
      }));

      assert.deepStrictEqual(received, [
        { body: JSON.stringify({ name: "a" }), contentLength: String(JSON.stringify({ name: "a" }).length) },
        { body: "s1s2", contentLength: undefined },
      ]);
    }
    finally {
      await stopHTTPServer(gateway);
    }
  });

  it("forwards the body and fetchOptions, changing only the URL and the forward header", async () => {
    const { fetch, sent } = recordingFetch();
    const api = faxios.create({ baseURL: "https://api.example.com", env: { fetch }, withCredentials: true })
      .use(forwardTo(GATEWAY));

    await api.post("/items", { name: "a" }, { fetchOptions: { cache: "no-store" }, headers: { "X-Trace": "1" } });

    assert.strictEqual(sent.length, 1);
    const { url, init, forwardTo: target } = sent[0]!;
    assert.strictEqual(url, GATEWAY);
    assert.strictEqual(target, "https://api.example.com/items");
    assert.strictEqual(init?.method, "POST");
    assert.strictEqual(init?.cache, "no-store");
    assert.strictEqual(init?.credentials, "include");
    assert.ok(init?.signal instanceof AbortSignal);
    // The adapter leaves the body on its Request; the gateway call carries it in the init.
    assert.strictEqual(await new Response(init?.body).text(), JSON.stringify({ name: "a" }));
    const headers = new Headers(init?.headers);
    assert.strictEqual(headers.get("X-Trace"), "1");
    assert.strictEqual(headers.get("Content-Type"), "application/json");
  });

  for (const order of [ "before", "after" ] as const) {
    it(`forwards every try to the target URL with retry installed ${order} it`, async () => {
      vi.useFakeTimers();
      const { fetch, sent } = recordingFetch([ 503, 503, 200 ]);
      const base = faxios.create({ baseURL: "https://api.example.com", env: { fetch } });
      const api = order === "before"
        ? base.use(retry({ delay: 0 })).use(forwardTo(GATEWAY))
        : base.use(forwardTo(GATEWAY)).use(retry({ delay: 0 }));

      const request = api.get("/health");
      await vi.runAllTimersAsync();
      await request;

      assert.deepStrictEqual(sent.map(({ url, forwardTo: target }) => [ url, target ]), [
        [ GATEWAY, "https://api.example.com/health" ],
        [ GATEWAY, "https://api.example.com/health" ],
        [ GATEWAY, "https://api.example.com/health" ],
      ]);
    });
  }

  it("sends a request with forward: false straight to its URL", async () => {
    const { fetch, sent } = recordingFetch();
    const api = faxios.create({ baseURL: "https://api.example.com", env: { fetch } }).use(forwardTo(GATEWAY));

    await api.get("/health", { forward: false });

    assert.deepStrictEqual(sent.map(({ url, forwardTo: target }) => [ url, target ]), [[ "https://api.example.com/health", null ]]);
  });

  it("rejects a per-request forward other than false", async () => {
    const { fetch, sent } = recordingFetch();
    const api = faxios.create({ baseURL: "https://api.example.com", env: { fetch } }).use(forwardTo(GATEWAY));

    // @ts-expect-error TS2769 -- only false turns forwarding off
    await assert.rejects(api.get("/health", { forward: true }), isCode(FaxiosError.ERR_BAD_OPTION_VALUE));

    assert.strictEqual(sent.length, 0);
  });

  it("forwards when the runtime has no global Request", async () => {
    vi.stubGlobal("Request", undefined);
    const { fetch, sent } = recordingFetch();
    const api = faxios.create({ baseURL: "https://api.example.com", env: { fetch, Request: null } }).use(forwardTo(GATEWAY));

    await api.get("/health", { params: { q: "1" } });

    assert.deepStrictEqual(sent.map(({ url, forwardTo: target }) => [ url, target ]), [[ GATEWAY, "https://api.example.com/health?q=1" ]]);
  });

  it("wraps a per-request env.fetch instead of replacing it", async () => {
    const instance = recordingFetch();
    const perRequest = recordingFetch();
    const api = faxios.create({ baseURL: "https://api.example.com", env: { fetch: instance.fetch } }).use(forwardTo(GATEWAY));

    await api.get("/health", { env: { fetch: perRequest.fetch } });

    assert.strictEqual(instance.sent.length, 0);
    assert.deepStrictEqual(perRequest.sent.map(({ url, forwardTo: target }) => [ url, target ]), [[ GATEWAY, "https://api.example.com/health" ]]);
  });

  it("puts the target URL in a custom header", async () => {
    const { fetch, sent } = recordingFetch();
    const api = faxios.create({ baseURL: "https://api.example.com", env: { fetch } })
      .use(forwardTo(GATEWAY, { header: "X-Target" }));

    await api.get("/health");

    const headers = new Headers(sent[0]!.init?.headers);
    assert.strictEqual(headers.get("X-Target"), "https://api.example.com/health");
    assert.strictEqual(headers.get("X-Forward-To"), null);
  });

  describe("options", () => {
    it("requires an absolute gateway URL", () => {
      for (const gateway of [ undefined, null, 8888, "/gateway", "gateway.local:8888", "ftp://gateway.local/", "" ]) {
        assert.throws(() => forwardTo(gateway as never), isCode(FaxiosError.ERR_BAD_OPTION_VALUE), String(gateway));
      }
    });

    it("rejects options that aren't an object", () => {
      for (const options of [ null, "X-Forward-To", 1 ]) {
        assert.throws(() => forwardTo(GATEWAY, options as never), isCode(FaxiosError.ERR_BAD_OPTION_VALUE), String(options));
      }
    });

    it("rejects a header that isn't a header name", () => {
      for (const header of [ "", "X Forward", "X-Forward\r\nX-Evil: 1", 1 ]) {
        assert.throws(() => forwardTo(GATEWAY, { header: header as never }), isCode(FaxiosError.ERR_BAD_OPTION_VALUE), String(header));
      }
    });

    it("rejects unknown options", () => {
      assert.throws(() => forwardTo(GATEWAY, { host: "X-Host" } as never), isCode(FaxiosError.ERR_BAD_OPTION));
    });

    it("ignores an inherited header option and inherited fetch init members", async () => {
      const proto = Object.prototype as Record<string, unknown>;
      proto["header"] = "X-Polluted";
      // fetch reads undici's dispatcher through the prototype chain, and with an env.fetch the adapter sets none.
      proto["dispatcher"] = { polluted: true };
      try {
        const { fetch, sent } = recordingFetch();
        const api = faxios.create({ baseURL: "https://api.example.com", env: { fetch } }).use(forwardTo(GATEWAY));

        await api.get("/health");

        assert.strictEqual(sent[0]!.forwardTo, "https://api.example.com/health");
        assert.strictEqual(new Headers(sent[0]!.init?.headers).get("X-Polluted"), null);
        assert.strictEqual((sent[0]!.init as Record<string, unknown> | undefined)?.["dispatcher"], undefined);
      }
      finally {
        delete proto["header"];
        delete proto["dispatcher"];
      }
    });
  });

  describe("types", () => {
    // eslint-disable-next-line vitest/expect-expect -- type-only: the @ts-expect-error lines are the assertions, checked by lint:ts
    it("types forward only on the instance use() returns", () => {
      // Never called: only the type checker reads these.
      async function typeChecks() {
        const bare = faxios.create();
        // @ts-expect-error TS2769 -- forwardTo() not installed
        await bare.get("/health", { forward: false });
        const api = bare.use(forwardTo(GATEWAY));
        await api.get("/health", { forward: false });
        await api.post("/items", {}, { forward: false });
        // @ts-expect-error TS2769 -- create() children don't inherit plugin options
        await api.create().get("/health", { forward: false });
      }
      void typeChecks;
    });
  });
});
