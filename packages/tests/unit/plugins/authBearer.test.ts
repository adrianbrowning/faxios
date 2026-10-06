import assert from "node:assert";
import { describe, expectTypeOf, it } from "vitest";
import faxios, { authBearer, FaxiosError } from "#src/index.ts";
import type { AuthBearerCapability, FaxiosPlugin } from "#src/index.ts";

const URL = "http://localhost/auth";

function recordingFetch(statusFor: (authorization: string | null) => number = () => 200) {
  const authorizations: Array<string | null> = [];
  const fetch = async (_input: Request | string | URL, init?: RequestInit) => {
    const authorization = new Headers(init?.headers).get("Authorization");
    authorizations.push(authorization);
    return new Response(null, { status: statusFor(authorization) });
  };
  return { fetch, authorizations };
}

// The refresh plugin from the docs: retry once with a fresh token after a 401.
function refreshOn401(refresh: () => Promise<void>): FaxiosPlugin<AuthBearerCapability> {
  return {
    name: "refreshOn401",
    middleware: async (ctx, next) => {
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
  };
}

describe("plugins::authBearer", () => {
  it("sends the token from a sync or async getToken as a Bearer header", async () => {
    const sync = recordingFetch();
    const async_ = recordingFetch();

    await faxios.create({ env: { fetch: sync.fetch } }).use(authBearer(() => "sync-token"))
      .get(URL);
    await faxios.create({ env: { fetch: async_.fetch } }).use(authBearer(async () => "async-token"))
      .get(URL);

    assert.deepStrictEqual(sync.authorizations, [ "Bearer sync-token" ]);
    assert.deepStrictEqual(async_.authorizations, [ "Bearer async-token" ]);
  });

  it("asks for the token on every request", async () => {
    let n = 0;
    const { fetch, authorizations } = recordingFetch();
    const api = faxios.create({ env: { fetch } }).use(authBearer(() => `token-${++n}`));

    await api.get(URL);
    await api.get(URL);

    assert.deepStrictEqual(authorizations, [ "Bearer token-1", "Bearer token-2" ]);
  });

  it("provides the auth capability to middleware installed after it", async () => {
    let seen: string | undefined;
    const { fetch } = recordingFetch();
    const api = faxios.create({ env: { fetch } }).use(authBearer(() => "token"))
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
    const api = faxios.create({ env: { fetch } })
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
});
