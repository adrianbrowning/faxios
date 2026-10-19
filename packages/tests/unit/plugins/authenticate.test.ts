import assert from "node:assert";
import { describe, it, vi } from "vitest";
import faxios, { FaxiosError } from "#src/index.ts";
import { authenticate } from "#src/lib/plugins/authenticate.ts";
import { retry } from "#src/lib/plugins/retry.ts";
import { makeSchema } from "../core/_schemaTestHelpers.js";

const BASE = "http://api.test";

type Sent = { headers: Headers; redirect: RequestRedirect | undefined; url: string; };

function recordingFetch(status = 200) {
  const sent: Array<Sent> = [];
  const fetch = async (input: Request | string | URL, init?: RequestInit) => {
    sent.push({ headers: new Headers(init?.headers), redirect: init?.redirect, url: String(input instanceof Request ? input.url : input) });
    return new Response(null, { status });
  };
  return { fetch, sent };
}

const isCode = (code: string) => (err: unknown) => err instanceof FaxiosError && err.code === code;

describe("plugins::authenticate", () => {
  it("sends headers, query parameters and cookies from one getCredentials", async () => {
    const { fetch, sent } = recordingFetch();
    const api = faxios.create({ baseURL: BASE, env: { fetch } }).use(authenticate(async () => ({
      headers: { "X-Api-Key": "key-1" },
      query: { api_key: "q-1" },
      cookies: { session: "s-1", theme: "dark" },
    })));

    await api.get("/data", { params: { page: 2 } });

    assert.strictEqual(sent[0]!.url, `${BASE}/data?page=2&api_key=q-1`);
    assert.strictEqual(sent[0]!.headers.get("x-api-key"), "key-1");
    assert.strictEqual(sent[0]!.headers.get("cookie"), "session=s-1; theme=dark");
  });

  it("asks for the credentials on every request and every try", async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      let status = 503;
      const sent: Array<string> = [];
      const fetch = async (input: Request | string | URL) => {
        sent.push(input instanceof Request ? input.url : String(input));
        const response = new Response(null, { status });
        status = 200;
        return response;
      };
      const api = faxios.create({ baseURL: BASE, env: { fetch } })
        .use(retry({ delay: 0 }))
        .use(authenticate(() => ({ query: { key: `k${++n}` } })));

      const request = api.get("/a");
      await vi.runAllTimersAsync();
      await request;
      await api.get("/b");

      assert.deepStrictEqual(sent, [ `${BASE}/a?key=k1`, `${BASE}/a?key=k2`, `${BASE}/b?key=k3` ]);
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("sends nothing for null, undefined and empty values, or when getCredentials gives none", async () => {
    for (const credentials of [ null, undefined, { headers: { "X-Api-Key": null }, query: { key: "" }, cookies: { session: undefined } }]) {
      const { fetch, sent } = recordingFetch();
      await faxios.create({ baseURL: BASE, env: { fetch } }).use(authenticate(() => credentials))
        .get("/x");
      assert.strictEqual(sent[0]!.url, `${BASE}/x`);
      assert.strictEqual(sent[0]!.headers.get("x-api-key"), null);
      assert.strictEqual(sent[0]!.headers.get("cookie"), null);
      // Nothing to protect, so redirects are followed as usual.
      assert.strictEqual(sent[0]!.redirect, "follow");
    }
  });

  it("keeps a header, query parameter or Cookie the request already has, unless overwrite", async () => {
    const credentials = () => ({ headers: { "X-Api-Key": "plugin" }, query: { key: "plugin" }, cookies: { session: "plugin" } });
    const request = { headers: { "X-Api-Key": "own", Cookie: "session=own" }, params: { key: "own" } };
    const kept = recordingFetch();
    const replaced = recordingFetch();

    await faxios.create({ baseURL: BASE, env: { fetch: kept.fetch } }).use(authenticate(credentials))
      .get("/x", request);
    await faxios.create({ baseURL: BASE, env: { fetch: replaced.fetch } }).use(authenticate(credentials, { overwrite: true }))
      .get("/x", request);

    assert.deepStrictEqual([ kept.sent[0]!.url, kept.sent[0]!.headers.get("x-api-key"), kept.sent[0]!.headers.get("cookie") ], [ `${BASE}/x?key=own`, "own", "session=own" ]);
    assert.deepStrictEqual([ replaced.sent[0]!.url, replaced.sent[0]!.headers.get("x-api-key"), replaced.sent[0]!.headers.get("cookie") ], [ `${BASE}/x?key=plugin`, "plugin", "session=plugin" ]);
  });

  it("adds to URLSearchParams params without changing the caller's object", async () => {
    const { fetch, sent } = recordingFetch();
    const params = new URLSearchParams({ page: "1" });
    await faxios.create({ baseURL: BASE, env: { fetch } }).use(authenticate(() => ({ query: { key: "k" } })))
      .get("/x", { params });

    assert.strictEqual(sent[0]!.url, `${BASE}/x?page=1&key=k`);
    assert.strictEqual(params.toString(), "page=1");
  });

  it("sends credentials only to the API's origin, without asking for them otherwise", async () => {
    const { fetch, sent } = recordingFetch();
    const getCredentials = vi.fn(() => ({ query: { key: "k" }, cookies: { session: "s" } }));
    const api = faxios.create({ baseURL: BASE, allowAbsoluteUrls: true, env: { fetch } }).use(authenticate(getCredentials));

    await api.get("https://other.test/x");
    await api.get("/x", { baseURL: "https://partner.test" });

    assert.deepStrictEqual(sent.map(s => [ s.url, s.headers.get("cookie") ]), [
      [ "https://other.test/x", null ],
      [ "https://partner.test/x", null ],
    ]);
    assert.strictEqual(getCredentials.mock.calls.length, 0);
  });

  it("refuses redirects for any header but Authorization, cookies and query parameters, unless the request sets redirect", async () => {
    const cases: Array<[Parameters<typeof authenticate>[0], RequestRedirect | undefined]> = [
      [ () => ({ headers: { Authorization: "Basic abc" } }), "follow" ],
      [ () => ({ query: { key: "k" } }), "error" ],
      [ () => ({ headers: { "X-Api-Key": "k" } }), "error" ],
      [ () => ({ cookies: { session: "s" } }), "error" ],
    ];
    for (const [ getCredentials, redirect ] of cases) {
      const { fetch, sent } = recordingFetch();
      await faxios.create({ baseURL: BASE, env: { fetch } }).use(authenticate(getCredentials))
        .get("/x");
      assert.strictEqual(sent[0]!.redirect, redirect);
    }
    const { fetch, sent } = recordingFetch();
    await faxios.create({ baseURL: BASE, env: { fetch } }).use(authenticate(() => ({ cookies: { session: "s" } })))
      .get("/x", { fetchOptions: { redirect: "follow" } });
    assert.strictEqual(sent[0]!.redirect, "follow");
    const query = recordingFetch();
    await faxios.create({ baseURL: BASE, env: { fetch: query.fetch } }).use(authenticate(() => ({ query: { key: "k" } })))
      .get("/x", { fetchOptions: { redirect: "follow" } });
    assert.strictEqual(query.sent[0]!.redirect, "follow");
  });

  it("adds query credentials after paramsSchema, which sees only the request's own params", async () => {
    const seen: Array<unknown> = [];
    // Keeps only `page`, like a strip-mode schema; rejects unknown keys, like a strict one.
    const strip = makeSchema((value: unknown) => {
      seen.push(value);
      return { value: { page: (value as Record<string, unknown>)["page"] } };
    });
    const strict = makeSchema((value: unknown) =>
      Object.keys(value as object).every(key => key === "page") ? { value } : { issues: [{ message: "unknown key" }] });
    const asyncStrip = makeSchema(async (value: unknown) => ({ value: { page: (value as Record<string, unknown>)["page"] } }));
    const { fetch, sent } = recordingFetch();
    const api = faxios.create({ baseURL: BASE, env: { fetch } }).use(authenticate(() => ({ query: { key: "k" } })));

    await api.get("/x", { params: { page: 1 }, paramsSchema: strip });
    await api.get("/x", { params: { page: 1 }, paramsSchema: strict });
    await api.get("/x", { params: { page: 1 }, paramsSchema: asyncStrip });

    assert.deepStrictEqual(sent.map(s => s.url), [ `${BASE}/x?page=1&key=k`, `${BASE}/x?page=1&key=k`, `${BASE}/x?page=1&key=k` ]);
    assert.deepStrictEqual(seen.map(value => ({ ...value as object })), [{ page: 1 }]);
  });

  it("leaves a malformed paramsSchema result, sync or async, for core to reject", async () => {
    const { fetch, sent } = recordingFetch();
    const api = faxios.create({ baseURL: BASE, env: { fetch } }).use(authenticate(() => ({ query: { key: "k" } })));
    const coreRejects = (err: unknown) =>
      err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_PARAMS_SCHEMA && err.message.includes("non-Result value");

    await assert.rejects(api.get("/x", { paramsSchema: makeSchema(() => undefined as never) }), coreRejects);
    await assert.rejects(api.get("/x", { paramsSchema: makeSchema(async () => undefined as never) }), coreRejects);
    assert.strictEqual(sent.length, 0);
  });

  it("keeps a query parameter the paramsSchema output already has, unless overwrite", async () => {
    const withKey = makeSchema(() => ({ value: { key: "own" } }));
    const kept = recordingFetch();
    const replaced = recordingFetch();
    const credentials = () => ({ query: { key: "plugin" } });

    await faxios.create({ baseURL: BASE, env: { fetch: kept.fetch } }).use(authenticate(credentials))
      .get("/x", { paramsSchema: withKey });
    await faxios.create({ baseURL: BASE, env: { fetch: replaced.fetch } }).use(authenticate(credentials, { overwrite: true }))
      .get("/x", { paramsSchema: withKey });

    assert.strictEqual(kept.sent[0]!.url, `${BASE}/x?key=own`);
    assert.strictEqual(replaced.sent[0]!.url, `${BASE}/x?key=plugin`);
  });

  it("doesn't change the caller's plain-object params", async () => {
    const { fetch, sent } = recordingFetch();
    const params = { page: 1 };
    await faxios.create({ baseURL: BASE, env: { fetch } }).use(authenticate(() => ({ query: { key: "k" } })))
      .get("/x", { params });

    assert.strictEqual(sent[0]!.url, `${BASE}/x?page=1&key=k`);
    assert.deepStrictEqual(params, { page: 1 });
  });

  it("rejects query credentials, sending nothing, when params isn't an object", async () => {
    const { fetch, sent } = recordingFetch();
    const api = faxios.create({ baseURL: BASE, env: { fetch } }).use(authenticate(() => ({ query: { key: "k" } })));

    // @ts-expect-error TS2769 -- a JavaScript caller can pass a string
    await assert.rejects(api.get("/x", { params: "page=1" }), isCode(FaxiosError.ERR_BAD_OPTION_VALUE));
    assert.strictEqual(sent.length, 0);
  });

  it("masks only the query parameters it sets, not one the request keeps", async () => {
    const { fetch } = recordingFetch(500);
    const api = faxios.create({ baseURL: BASE, env: { fetch } })
      .use(authenticate(() => ({ query: { api_key: "secret", page: "9" } })));

    const err = await api.get("/x", { params: { page: "own-page" } }).catch((error: unknown) => error);

    assert.ok(err instanceof FaxiosError);
    assert.deepStrictEqual(err.config?.redact, [ "api_key" ]);
  });

  it("masks custom header and query credentials in error.toJSON()", async () => {
    const { fetch } = recordingFetch(500);
    const api = faxios.create({ baseURL: BASE, env: { fetch } })
      .use(authenticate(() => ({ headers: { "X-Api-Key": "secret-key" }, query: { api_key: "secret-query" } })));

    const err = await api.get("/x").catch((error: unknown) => error);

    assert.ok(err instanceof FaxiosError);
    const json = JSON.stringify(err.toJSON());
    assert.ok(!json.includes("secret-key"), json);
    assert.ok(!json.includes("secret-query"), json);
  });

  it("rejects, sending nothing, credentials that can't be sent as given", async () => {
    const cases: Array<[unknown, string]> = [
      [ "token", FaxiosError.ERR_BAD_OPTION_VALUE ],
      [{ params: { key: "k" } }, FaxiosError.ERR_BAD_OPTION ],
      [{ headers: [ "X-Api-Key" ] }, FaxiosError.ERR_BAD_OPTION_VALUE ],
      [{ headers: { "X-Api-Key\r\nX-Evil": "1" } }, FaxiosError.ERR_BAD_OPTION_VALUE ],
      [{ cookies: { "a b": "1" } }, FaxiosError.ERR_BAD_OPTION_VALUE ],
      [{ cookies: { session: "s; admin=1" } }, FaxiosError.ERR_BAD_OPTION_VALUE ],
      [{ query: { "": "k" } }, FaxiosError.ERR_BAD_OPTION_VALUE ],
    ];
    for (const [ credentials, code ] of cases) {
      const { fetch, sent } = recordingFetch();
      const api = faxios.create({ baseURL: BASE, env: { fetch } }).use(authenticate(() => credentials as never));
      await assert.rejects(api.get("/x"), isCode(code), JSON.stringify(credentials));
      assert.strictEqual(sent.length, 0);
    }
  });

  it("rejects invalid options when the plugin is created", () => {
    const getCredentials = () => null;
    // @ts-expect-error TS2345 -- getCredentials must be a function
    assert.throws(() => authenticate("nope"), isCode(FaxiosError.ERR_BAD_OPTION_VALUE));
    // @ts-expect-error TS2322 -- overwrite is a boolean
    assert.throws(() => authenticate(getCredentials, { overwrite: "yes" }), isCode(FaxiosError.ERR_BAD_OPTION_VALUE));
    assert.throws(() => authenticate(getCredentials, { origins: [ "https://api.test/v1" ] }), isCode(FaxiosError.ERR_BAD_OPTION_VALUE));
    // @ts-expect-error TS2353 -- header is an authBearer option, not an authenticate one
    assert.throws(() => authenticate(getCredentials, { header: "X" }), isCode(FaxiosError.ERR_BAD_OPTION));
  });
});
