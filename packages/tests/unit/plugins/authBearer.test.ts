import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expectTypeOf, it, vi } from "vitest";
import faxios, { FaxiosError, FaxiosHeaders } from "#src/index.ts";
import { authBearer } from "#src/lib/plugins/authBearer.ts";
import { definePlugin } from "#src/lib/plugins/definePlugin.ts";
import { retry } from "#src/lib/plugins/retry.ts";
import { startHTTPServer, stopHTTPServer } from "../../setup/server.js";

const BASE = "http://localhost";
const URL = "/auth";

function recordingFetch(statusFor: (authorization: null | string) => number = () => 200) {
  const authorizations: Array<null | string> = [];
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
  const sent: Array<null | string> = [];
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

// The refresh plugin from the docs: installed before authBearer, it never sets Authorization.
// On a 401 it waits for one shared refresh and calls next again, so authBearer reapplies its origin rule.
function refreshOn401(refresh: () => Promise<void>) {
  let refreshing: Promise<void> | undefined;
  return definePlugin({
    name: "refreshOn401",
    middleware: async (ctx, next) => {
      try {
        return await next(ctx);
      }
      catch (err) {
        if (!(err instanceof FaxiosError) || err.response?.status !== 401) throw err;
        refreshing ??= refresh().finally(() => {
          refreshing = undefined;
        });
        await refreshing;
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

  it("sends no header when getToken gives something other than a non-empty string", async () => {
    const values: Array<unknown> = [ null, undefined, "", 42, { token: "x" }];
    for (const value of values) {
      const { fetch, authorizations } = recordingFetch();
      // Callers without TypeScript (or with a cast) can return anything.
      await faxios.create({ baseURL: BASE, env: { fetch } }).use(authBearer(async () => value as string))
        .get(URL);
      assert.deepStrictEqual(authorizations, [ null ], `getToken returned ${String(value)}`);
    }
    const { fetch, authorizations } = recordingFetch();
    await faxios.create({ baseURL: BASE, env: { fetch } }).use(authBearer(() => "x"))
      .get(URL);
    assert.deepStrictEqual(authorizations, [ "Bearer x" ]);
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

  it("passes a null-prototype ctx.config to middleware installed after it", async () => {
    let proto: unknown = "unset";
    const { fetch } = recordingFetch();
    const api = faxios.create({ baseURL: BASE, env: { fetch } }).use(authBearer(() => "token"))
      .use(async (ctx, next) => {
        proto = Object.getPrototypeOf(ctx.config);
        return next(ctx);
      });

    await api.get(URL);

    assert.strictEqual(proto, null);
  });

  it("works with a refreshOn401 plugin that retries once with a fresh token", async () => {
    let token = "expired";
    const { fetch, authorizations } = recordingFetch(authorization => authorization === "Bearer fresh" ? 200 : 401);
    const api = faxios.create({ baseURL: BASE, env: { fetch } })
      .use(refreshOn401(async () => {
        token = "fresh";
      }))
      .use(authBearer(() => token));

    const response = await api.get(URL);

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(authorizations, [ "Bearer expired", "Bearer fresh" ]);
  });

  it("retries a third-party 401 through refreshOn401 without a token", async () => {
    let token = "expired";
    const { fetch, authorizations } = recordingFetch(() => 401);
    const api = faxios.create({ baseURL: "https://api.test", allowAbsoluteUrls: true, env: { fetch } })
      .use(refreshOn401(async () => {
        token = "fresh";
      }))
      .use(authBearer(() => token));

    const err = await api.get("https://third-party.test/hook").catch((e: unknown) => e);

    assert.ok(err instanceof FaxiosError);
    assert.strictEqual(err.response?.status, 401);
    assert.deepStrictEqual(authorizations, [ null, null ]);
  });

  // refreshOn401 shares one refresh between the requests; what faxios must do is run each
  // request's second try back through authBearer, which asks for the token again for that try.
  it("sends the refreshed token on each retry of concurrent 401s that share one refresh", async () => {
    let token = "expired";
    let tokenReads = 0;
    let markAllSent!: () => void;
    const allSent = new Promise<void>(resolve => {
      markAllSent = resolve;
    });
    let expiredSeen = 0;
    const { fetch, authorizations } = recordingFetch(authorization => {
      if (authorization === "Bearer fresh") return 200;
      expiredSeen += 1;
      if (expiredSeen === 5) markAllSent();
      return 401;
    });
    const api = faxios.create({ baseURL: BASE, env: { fetch } })
      .use(refreshOn401(async () => {
        await allSent;
        token = "fresh";
      }))
      .use(authBearer(() => {
        tokenReads += 1;
        return token;
      }));

    const responses = await Promise.all(Array.from({ length: 5 }, async () => api.get(URL)));

    assert.deepStrictEqual(responses.map(r => r.status), [ 200, 200, 200, 200, 200 ]);
    assert.deepStrictEqual(authorizations, [ ...Array(5).fill("Bearer expired"), ...Array(5).fill("Bearer fresh") ]);
    assert.strictEqual(tokenReads, 10);
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

  describe("a custom header and redirects", () => {
    it("never reaches another origin the API redirects to", async () => {
      const received: Array<string | undefined> = [];
      const originB = await startHTTPServer((req, res) => {
        const value = req.headers["x-api-key"];
        received.push(typeof value === "string" ? value : undefined);
        res.end("ok");
      });
      const portB = (originB.address() as AddressInfo).port;
      const originA = await startHTTPServer((_req, res) => {
        res.writeHead(302, { Location: `http://127.0.0.1:${portB}/landing` });
        res.end();
      });
      try {
        const api = faxios.create({ baseURL: `http://127.0.0.1:${(originA.address() as AddressInfo).port}` })
          .use(authBearer(() => "secret-key", { header: "X-Api-Key", scheme: "" }));

        await assert.rejects(api.get("/start"), (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ERR_NETWORK);
        assert.deepStrictEqual(received, []);
      }
      finally {
        await stopHTTPServer(originA);
        await stopHTTPServer(originB);
      }
    });

    it("sets fetchOptions.redirect to \"error\" only for a custom header the caller hasn't set redirect for", async () => {
      const redirects: Array<unknown> = [];
      const fetch = async (_input: Request | string | URL, init?: RequestInit) => {
        redirects.push(init?.redirect);
        return new Response(null, { status: 200 });
      };
      const custom = faxios.create({ baseURL: BASE, env: { fetch } }).use(authBearer(() => "key", { header: "X-Api-Key" }));
      const standard = faxios.create({ baseURL: BASE, env: { fetch } }).use(authBearer(() => "token", { header: "authorization" }));

      await custom.get(URL);
      await custom.get(URL, { fetchOptions: { redirect: "manual" } });
      await standard.get(URL);

      // "follow" is fetch's own default, which the adapter writes when nothing sets redirect.
      assert.deepStrictEqual(redirects, [ "error", "manual", "follow" ]);
    });
  });

  describe("origin limit", () => {
    it("with an absolute baseURL, sends the token only to that origin", async () => {
      const { fetch, authorizations } = recordingFetch();
      const api = faxios.create({ baseURL: "https://api.test/v1", allowAbsoluteUrls: true, env: { fetch } })
        .use(authBearer(() => "token"));
      // allowAbsoluteUrls: false (the default) rejects an absolute URL before any token is read.
      const strict = faxios.create({ baseURL: "https://api.test/v1", env: { fetch } }).use(authBearer(() => "token"));

      await api.get("/items");
      await api.get("https://api.test/other");
      await api.get("https://evil.test/items");
      await api.get("http://api.test/items");
      await assert.rejects(strict.get("https://evil.test/items"), { code: "ERR_INVALID_URL" });

      assert.deepStrictEqual(authorizations, [ "Bearer token", "Bearer token", null, null ]);
    });

    it("with an instance baseURL, rejects an absolute URL without calling getToken", async () => {
      const { fetch, authorizations } = recordingFetch();
      const getToken = vi.fn(() => "token");
      const api = faxios.create({ baseURL: "https://api.test", env: { fetch } }).use(authBearer(getToken));

      await assert.rejects(api.get("https://other.test/items"), { code: "ERR_INVALID_URL" });

      assert.strictEqual(getToken.mock.calls.length, 0);
      assert.deepStrictEqual(authorizations, []);
    });

    it("applies the origin rule to the instance baseURL, so a per-request baseURL doesn't get the token", async () => {
      const { fetch, authorizations } = recordingFetch();
      const api = faxios.create({ baseURL: "https://api.test", env: { fetch } }).use(authBearer(() => "token"));
      const bare = faxios.create({ env: { fetch } }).use(authBearer(() => "token"));

      await api.get("/items");
      await api.get("/items", { baseURL: "https://partner.test" });
      await api.get("/items", { baseURL: "https://api.test/v2" });
      await bare.get("/items", { baseURL: "https://partner.test" });

      assert.deepStrictEqual(authorizations, [ "Bearer token", null, "Bearer token", null ]);
    });

    // Middleware runs before pathParamsSchema, so the raw pathParams can't fill the template.
    it("sends the token when pathParamsSchema fills a placeholder with a default", async () => {
      const urls: Array<string> = [];
      const { fetch, authorizations } = recordingFetch();
      const recording = async (input: Request | string | URL, init?: RequestInit) => {
        urls.push(input instanceof Request ? input.url : String(input));
        return fetch(input, init);
      };
      const pathParamsSchema = { "~standard": { version: 1 as const, vendor: "test", validate: (value: unknown) => ({ value: { version: "v2", ...(value as object) } }) } };
      const api = faxios.create({ baseURL: "https://api.test", env: { fetch: recording } }).use(authBearer(() => "token"));

      await api.get("/{version}/users", { pathParams: {}, pathParamsSchema });

      assert.deepStrictEqual(urls, [ "https://api.test/v2/users" ]);
      assert.deepStrictEqual(authorizations, [ "Bearer token" ]);
    });

    it("sends the token when pathParamsSchema renames a placeholder's key", async () => {
      const urls: Array<string> = [];
      const { fetch, authorizations } = recordingFetch();
      const recording = async (input: Request | string | URL, init?: RequestInit) => {
        urls.push(input instanceof Request ? input.url : String(input));
        return fetch(input, init);
      };
      const rename = (value: unknown) => ({ value: { userId: value && typeof value === "object" && "id" in value ? value.id : undefined } });
      const pathParamsSchema = { "~standard": { version: 1 as const, vendor: "test", validate: rename } };
      const api = faxios.create({ baseURL: "https://api.test", env: { fetch: recording } }).use(authBearer(() => "token"));

      await api.get("/users/{userId}", { pathParams: { id: "7" }, pathParamsSchema });

      assert.deepStrictEqual(urls, [ "https://api.test/users/7" ]);
      assert.deepStrictEqual(authorizations, [ "Bearer token" ]);
    });

    it("sends no token when a path param fills the URL's scheme", async () => {
      const urls: Array<string> = [];
      const { fetch, authorizations } = recordingFetch();
      const recording = async (input: Request | string | URL, init?: RequestInit) => {
        urls.push(input instanceof Request ? input.url : String(input));
        return fetch(input, init);
      };
      const api = faxios.create({ baseURL: "https://api.test", allowAbsoluteUrls: true, env: { fetch: recording } })
        .use(authBearer(() => "token"));

      await api.get("{s}://evil.test/x", { pathParams: { s: "https" } });

      assert.deepStrictEqual(urls, [ "https://evil.test/x" ]);
      assert.deepStrictEqual(authorizations, [ null ]);
    });

    it("sends no token when a path param fills the URL's authority", async () => {
      const urls: Array<string> = [];
      const { fetch, authorizations } = recordingFetch();
      const recording = async (input: Request | string | URL, init?: RequestInit) => {
        urls.push(input instanceof Request ? input.url : String(input));
        return fetch(input, init);
      };
      const api = faxios.create({ baseURL: "https://api.test", allowAbsoluteUrls: true, env: { fetch: recording } })
        .use(authBearer(() => "token"));
      const listed = faxios.create({ allowAbsoluteUrls: true, env: { fetch: recording } })
        .use(authBearer(() => "token", { origins: [ "https://api.test" ] }));

      await api.get("https://{host}/x", { pathParams: { host: "api.test" } });
      await listed.get("https://{host}/x", { pathParams: { host: "api.test" } });
      // A placeholder after the authority still gets the token.
      await api.get("https://api.test/{id}", { pathParams: { id: "7" } });

      assert.deepStrictEqual(urls, [ "https://api.test/x", "https://api.test/x", "https://api.test/7" ]);
      assert.deepStrictEqual(authorizations, [ null, null, "Bearer token" ]);
    });

    // An empty value would delete the text between two slashes and turn what follows into a host.
    it("rejects an empty path param that would collapse the template into a new origin, sending nothing", async () => {
      const { fetch, authorizations } = recordingFetch();
      const bare = faxios.create({ env: { fetch } }).use(authBearer(() => "token"));
      const api = faxios.create({ baseURL: "https://api.test", allowAbsoluteUrls: true, env: { fetch } })
        .use(authBearer(() => "token"));
      const isEmptyParam = { code: "ERR_BAD_OPTION_VALUE", message: "Path param \"x\" must not be empty" };

      await assert.rejects(bare.get("{s}:/{x}/evil.test/p", { pathParams: { s: "https", x: "" } }), isEmptyParam);
      await assert.rejects(api.get("{s}:/{x}/evil.test/p", { pathParams: { s: "https", x: "" } }), isEmptyParam);
      await assert.rejects(bare.get("/{x}/{repo}", { pathParams: { x: "", repo: "evil.test" } }), isEmptyParam);

      assert.deepStrictEqual(authorizations, []);
    });

    // The URL parser drops tabs and line breaks, so `{s}:\t//host` would turn into `https://host`.
    it("rejects a URL with a tab or line break that would hide a scheme placeholder, sending nothing", async () => {
      const { fetch, authorizations } = recordingFetch();
      const bare = faxios.create({ env: { fetch } }).use(authBearer(() => "token"));
      const api = faxios.create({ baseURL: "https://api.test", env: { fetch } }).use(authBearer(() => "token"));
      const isInvalid = { code: "ERR_INVALID_URL", message: "Invalid URL: contains a tab or line break" };

      for (const url of [ "{s}:\t//evil.test/p", "{s}:/\n/evil.test/p", "{s}:\r//evil.test/p" ]) {
        await assert.rejects(bare.get(url, { pathParams: { s: "https" } }), isInvalid, JSON.stringify(url));
        await assert.rejects(api.get(url, { baseURL: "", pathParams: { s: "https" } }), isInvalid, JSON.stringify(url));
      }

      assert.deepStrictEqual(authorizations, []);
    });

    it("still sends the token to the API for ordinary path placeholders", async () => {
      const urls: Array<string> = [];
      const { fetch, authorizations } = recordingFetch();
      const recording = async (input: Request | string | URL, init?: RequestInit) => {
        urls.push(input instanceof Request ? input.url : String(input));
        return fetch(input, init);
      };
      const api = faxios.create({ baseURL: "https://api.test/v1", env: { fetch: recording } }).use(authBearer(() => "token"));

      await api.get("/{org}/{repo}", { pathParams: { org: "acme", repo: "evil.test" } });
      await api.get("/users/{id}", { pathParams: { id: "a b" }, params: { q: "{x}" } });

      assert.deepStrictEqual(urls, [ "https://api.test/v1/acme/evil.test", "https://api.test/v1/users/a%20b?q=%7Bx%7D" ]);
      assert.deepStrictEqual(authorizations, [ "Bearer token", "Bearer token" ]);
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
