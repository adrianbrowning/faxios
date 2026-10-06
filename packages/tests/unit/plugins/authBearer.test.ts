import assert from "node:assert";
import { afterEach, describe, expectTypeOf, it, vi } from "vitest";
import faxios, { FaxiosError, FaxiosHeaders } from "#src/index.ts";
import type { FaxiosContext } from "#src/index.ts";
import { authBearer } from "#src/lib/plugins/authBearer.ts";
import type { AuthBearerCapability } from "#src/lib/plugins/authBearer.ts";
import { definePlugin } from "#src/lib/plugins/definePlugin.ts";
import { retry } from "#src/lib/plugins/retry.ts";

const BASE = "http://localhost";
const URL = "/auth";

function recordingFetch(statusFor: (authorization: string | null) => number = () => 200) {
  const authorizations: Array<string | null> = [];
  const headers: Array<Headers> = [];
  const fetch = async (_input: Request | string | URL, init?: RequestInit) => {
    const sent = new Headers(init?.headers);
    headers.push(sent);
    authorizations.push(sent.get("Authorization"));
    return new Response(null, { status: statusFor(sent.get("Authorization")) });
  };
  return { fetch, authorizations, headers };
}

// Stands in for dispatch, so request URLs that fetch can't resolve in Node (relative,
// protocol-relative) still show which headers would have been sent.
function capture() {
  const sent: Array<string | null> = [];
  const middleware = definePlugin({
    name: "capture",
    middleware: async ctx => {
      const value = ctx.config.headers.get("Authorization");
      sent.push(typeof value === "string" ? value : null);
      return { data: null, status: 200, statusText: "OK", headers: new FaxiosHeaders(), config: ctx.config };
    },
  });
  return { middleware, sent };
}

// The refresh plugin from the docs: retry once with a fresh token after a 401.
function refreshOn401(refresh: () => Promise<void>) {
  return definePlugin({
    name: "refreshOn401",
    middleware: async (ctx: FaxiosContext<unknown, AuthBearerCapability>, next) => {
      try {
        return await next(ctx);
      }
      catch (err) {
        if (!(err instanceof FaxiosError) || err.response?.status !== 401) throw err;
        await refresh();
        ctx.config.headers.set("Authorization", `Bearer ${await ctx.capabilities.auth.getToken()}`);
        return next(ctx);
      }
    },
  });
}

describe("plugins::authBearer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the token from a sync or async getToken as a Bearer header", async () => {
    const sync = recordingFetch();
    const async_ = recordingFetch();

    await faxios.create({ baseURL: BASE, env: { fetch: sync.fetch } }).use(authBearer(() => "sync-token"))
      .get(URL);
    await faxios.create({ baseURL: BASE, env: { fetch: async_.fetch } }).use(authBearer(async () => "async-token"))
      .get(URL);

    assert.deepStrictEqual(sync.authorizations, [ "Bearer sync-token" ]);
    assert.deepStrictEqual(async_.authorizations, [ "Bearer async-token" ]);
  });

  it("asks for the token on every request", async () => {
    let n = 0;
    const { fetch, authorizations } = recordingFetch();
    const api = faxios.create({ baseURL: BASE, env: { fetch } }).use(authBearer(() => `token-${++n}`));

    await api.get(URL);
    await api.get(URL);

    assert.deepStrictEqual(authorizations, [ "Bearer token-1", "Bearer token-2" ]);
  });

  it("asks again on every try when retry is installed before it", async () => {
    vi.useFakeTimers();
    let n = 0;
    const { fetch, authorizations } = recordingFetch(() => (n === 1 ? 503 : 200));
    const api = faxios.create({ baseURL: BASE, env: { fetch } })
      .use(retry({ delay: 0 }))
      .use(authBearer(() => `token-${++n}`));

    const request = api.get(URL);
    await vi.runAllTimersAsync();
    await request;

    assert.deepStrictEqual(authorizations, [ "Bearer token-1", "Bearer token-2" ]);
  });

  it("provides the auth capability to middleware installed after it", async () => {
    let seen: string | undefined;
    const { fetch } = recordingFetch();
    const api = faxios.create({ baseURL: BASE, env: { fetch } }).use(authBearer(() => "token"))
      .use(async (ctx, next) => {
        expectTypeOf(ctx.capabilities.auth.getToken).toEqualTypeOf<() => Promise<string>>();
        seen = await ctx.capabilities.auth.getToken();
        return next(ctx);
      });

    await api.get(URL);

    assert.strictEqual(seen, "token");
  });

  it("works with a refreshOn401 plugin that retries once with a fresh token", async () => {
    let token = "expired";
    const { fetch, authorizations } = recordingFetch(authorization => authorization === "Bearer fresh" ? 200 : 401);
    const api = faxios.create({ baseURL: BASE, env: { fetch } })
      .use(authBearer(() => token))
      .use(refreshOn401(async () => {
        token = "fresh";
      }));

    const response = await api.get(URL);

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(authorizations, [ "Bearer expired", "Bearer fresh" ]);
  });

  it("is a type error to install refreshOn401 without authBearer", () => {
    function surfaces(): void {
      // @ts-expect-error TS2345 -- refreshOn401 requires the auth capability
      faxios.create().use(refreshOn401(async () => undefined));
    }
    void surfaces;
  });

  describe("an explicit header", () => {
    it("is kept, per request or from the instance defaults, without asking for a token", async () => {
      const getToken = vi.fn(() => "token");
      const { fetch, authorizations } = recordingFetch();
      const api = faxios.create({ baseURL: BASE, env: { fetch } }).use(authBearer(getToken));
      const withDefault = faxios.create({ baseURL: BASE, env: { fetch }, headers: { Authorization: "Basic instance" } })
        .use(authBearer(getToken));

      await api.get(URL, { headers: { Authorization: "Basic abc" } });
      await withDefault.get(URL);

      assert.deepStrictEqual(authorizations, [ "Basic abc", "Basic instance" ]);
      assert.strictEqual(getToken.mock.calls.length, 0);
    });

    it("is replaced with overwrite: true", async () => {
      const { fetch, authorizations } = recordingFetch();
      const api = faxios.create({ baseURL: BASE, env: { fetch } }).use(authBearer(() => "token", { overwrite: true }));

      await api.get(URL, { headers: { Authorization: "Basic abc" } });

      assert.deepStrictEqual(authorizations, [ "Bearer token" ]);
    });
  });

  it("sends a custom scheme in a custom header", async () => {
    const { fetch, headers } = recordingFetch();
    const api = faxios.create({ baseURL: BASE, env: { fetch } })
      .use(authBearer(() => "abc", { scheme: "Token", header: "X-Api-Key" }));
    const bare = faxios.create({ baseURL: BASE, env: { fetch } })
      .use(authBearer(() => "raw", { scheme: "", header: "X-Api-Key" }));

    await api.get(URL);
    await bare.get(URL);

    assert.strictEqual(headers[0]!.get("X-Api-Key"), "Token abc");
    assert.strictEqual(headers[0]!.get("Authorization"), null);
    assert.strictEqual(headers[1]!.get("X-Api-Key"), "raw");
  });

  describe("origin limit", () => {
    it("with an absolute baseURL, sends the token only to that origin", async () => {
      const { fetch, authorizations } = recordingFetch();
      const api = faxios.create({ baseURL: "https://api.test/v1", allowAbsoluteUrls: true, env: { fetch } })
        .use(authBearer(() => "token"));
      // allowAbsoluteUrls: false (the default) appends an absolute URL to the baseURL, so it stays on it.
      const appended = faxios.create({ baseURL: "https://api.test/v1", env: { fetch } }).use(authBearer(() => "token"));

      await api.get("/items");
      await api.get("https://api.test/other");
      await api.get("https://evil.test/items");
      await api.get("http://api.test/items");
      await appended.get("https://evil.test/items");

      assert.deepStrictEqual(authorizations, [ "Bearer token", "Bearer token", null, null, "Bearer token" ]);
    });

    it("on the default singleton, sends no token to an absolute URL", async () => {
      const { fetch, authorizations } = recordingFetch();
      const plugin = authBearer(() => "token");
      faxios.use(plugin);
      try {
        await faxios.get("https://anywhere.test/items", { env: { fetch } });
      }
      finally {
        faxios.eject(plugin);
      }

      assert.deepStrictEqual(authorizations, [ null ]);
    });

    it("with a relative or missing baseURL, sends the token only to relative URLs", async () => {
      const { middleware, sent } = capture();
      const noBase = faxios.create().use(authBearer(() => "token"))
        .use(middleware);
      const relativeBase = faxios.create({ baseURL: "/api", allowAbsoluteUrls: true }).use(authBearer(() => "token"))
        .use(middleware);

      await noBase.get("/items");
      await relativeBase.get("items");
      await noBase.get("https://evil.test/items");
      await relativeBase.get("https://evil.test/items");
      // Browsers resolve these to another host.
      await noBase.get("//evil.test/items");
      await noBase.get("/\\evil.test/items");

      assert.deepStrictEqual(sent, [ "Bearer token", "Bearer token", null, null, null, null ]);
    });

    it("with origins, sends the token only to the listed origins", async () => {
      const { fetch, authorizations } = recordingFetch();
      const { middleware, sent } = capture();
      const api = faxios.create({ baseURL: "https://other.test", allowAbsoluteUrls: true, env: { fetch } })
        .use(authBearer(() => "token", { origins: [ "https://a.test", "https://b.test:8443/" ] }));
      const relative = faxios.create().use(authBearer(() => "token", { origins: [ "https://a.test" ] }))
        .use(middleware);

      await api.get("https://a.test/items");
      await api.get("https://b.test:8443/items");
      await api.get("https://b.test/items");
      // origins replaces the baseURL rule.
      await api.get("/items");
      // Node has no page origin to resolve a relative URL against.
      await relative.get("/items");

      assert.deepStrictEqual(authorizations, [ "Bearer token", "Bearer token", null, null ]);
      assert.deepStrictEqual(sent, [ null ]);
    });
  });

  it("rejects invalid options when the plugin is created", () => {
    const isBadValue = (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION_VALUE;
    const isUnknown = (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION;
    const getToken = () => "token";

    // @ts-expect-error TS2345 -- getToken must be a function
    assert.throws(() => authBearer("token"), isBadValue);
    // @ts-expect-error TS2345 -- null isn't an options object
    assert.throws(() => authBearer(getToken, null), isBadValue);
    // @ts-expect-error TS2322 -- overwrite is a boolean
    assert.throws(() => authBearer(getToken, { overwrite: "yes" }), isBadValue);
    // @ts-expect-error TS2322 -- scheme is a string
    assert.throws(() => authBearer(getToken, { scheme: 1 }), isBadValue);
    assert.throws(() => authBearer(getToken, { scheme: "Bearer\r\nX-Injected: 1" }), isBadValue);
    assert.throws(() => authBearer(getToken, { header: "" }), isBadValue);
    assert.throws(() => authBearer(getToken, { header: "Bad Header" }), isBadValue);
    assert.throws(() => authBearer(getToken, { origins: [ "not a url" ] }), isBadValue);
    // A path would look like a narrower limit than the origin it really grants.
    assert.throws(() => authBearer(getToken, { origins: [ "https://a.test/v1" ] }), isBadValue);
    // @ts-expect-error TS2322 -- origins is an array
    assert.throws(() => authBearer(getToken, { origins: "https://a.test" }), isBadValue);
    // @ts-expect-error TS2353 -- unknown option
    assert.throws(() => authBearer(getToken, { prefix: "Bearer" }), isUnknown);
  });
});
