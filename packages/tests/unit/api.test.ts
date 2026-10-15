import assert from "node:assert";
import { describe, it } from "vitest";
import * as root from "#src/index.ts";
import faxios, { create, Faxios, FaxiosError } from "#src/index.ts";
import type { FaxiosInstance, FaxiosMiddleware, FaxiosRequestConfig } from "#src/index.ts";
import * as pluginsEntry from "#src/lib/plugins/definePlugin.ts";

const okFetch = async () => new Response(null, { status: 200 });

// Each helper sends its own method, its URL and, for the body methods, its data.
const sentByEveryHelper = async (client: FaxiosInstance) => {
  const sent: Array<[string, string, string]> = [];
  const fetch = async (input: Request | string | URL) => {
    assert.ok(input instanceof Request);
    sent.push([ input.method, new URL(input.url).pathname, await input.text() ]);
    return new Response(null, { status: 200 });
  };
  const config = { env: { fetch } };
  await client.request({ ...config, url: "http://localhost/request", method: "post", data: "r" });
  await client.get("http://localhost/get", config);
  await client.head("http://localhost/head", config);
  await client.options("http://localhost/options", config);
  await client.delete("http://localhost/delete", config);
  await client.post("http://localhost/post", "p", config);
  await client.put("http://localhost/put", "u", config);
  await client.patch("http://localhost/patch", "a", config);
  await client.query("http://localhost/query", "q", config);
  return sent;
};

const everyHelperSends = [
  [ "POST", "/request", "r" ],
  [ "GET", "/get", "" ],
  [ "HEAD", "/head", "" ],
  [ "OPTIONS", "/options", "" ],
  [ "DELETE", "/delete", "" ],
  [ "POST", "/post", "p" ],
  [ "PUT", "/put", "u" ],
  [ "PATCH", "/patch", "a" ],
  [ "QUERY", "/query", "q" ],
];

// Runs a request through `client` and returns the URL of each request the middleware saw.
const seenByMiddleware = async (client: FaxiosInstance) => {
  const log: Array<string> = [];
  const mw: FaxiosMiddleware = async (ctx, next) => {
    log.push(ctx.config.url ?? "");
    return next(ctx);
  };
  client.use(mw);
  try {
    await client.get("http://localhost/used", { env: { fetch: okFetch } });
  }
  finally {
    client.eject(mw);
  }
  await client.get("http://localhost/ejected", { env: { fetch: okFetch } });
  return log;
};

describe("static api", () => {
  it("should have request method helpers", async () => {
    assert.deepStrictEqual(await sentByEveryHelper(faxios), everyHelperSends);
  });

  it("should have promise method helpers", async () => {
    const ok = faxios.request({ url: "http://localhost/test", env: { fetch: okFetch } });
    const failed = faxios.request({ url: "http://localhost/test", env: { fetch: async () => new Response(null, { status: 500 }) } });

    assert.strictEqual(await ok.then(res => res.status), 200);
    assert.strictEqual(await failed.catch((err: unknown) => err instanceof FaxiosError && err.response?.status), 500);
  });

  it("should have defaults", async () => {
    let sent: null | string = null;
    const fetch = async (input: Request | string | URL) => {
      assert.ok(input instanceof Request);
      sent = input.headers.get("x-default");
      return new Response(null, { status: 200 });
    };
    faxios.defaults.headers.common["X-Default"] = "on";
    try {
      await faxios.get("http://localhost/", { env: { fetch } });
    }
    finally {
      delete faxios.defaults.headers.common["X-Default"];
    }
    assert.strictEqual(sent, "on");
  });

  it("should have use/eject", async () => {
    assert.deepStrictEqual(await seenByMiddleware(faxios), [ "http://localhost/used" ]);
  });

  it("keeps plugin exports off the root: definePlugin on /plugins, each built-in on its own subpath", () => {
    // @gcmdev/faxios/plugins exports definePlugin and nothing else, no built-ins.
    assert.deepStrictEqual(Object.keys(pluginsEntry), [ "definePlugin" ]);
    for (const name of [ "authBearer", "retry", "timing", "plugins", "definePlugin" ]) {
      assert.strictEqual(Object.hasOwn(root, name), false, `root exports ${name}`);
    }
    // @ts-expect-error TS2339 -- the built-ins moved to their own subpaths
    assert.strictEqual(faxios.plugins, undefined);
  });

  it("registers middleware only through the callable instance, not the Faxios class", () => {
    const bare = new Faxios();
    // @ts-expect-error TS2339 -- use() is typed only on the instance faxios.create() returns
    assert.strictEqual(bare.use, undefined);
    // @ts-expect-error TS2339 -- eject() is typed only on the instance faxios.create() returns
    assert.strictEqual(bare.eject, undefined);
  });

  it("only types the static members on the default export", () => {
    const instance = create();
    // Created instances have none of the statics at runtime, so their type mustn't either.
    // @ts-expect-error TS2339 -- mergeConfig exists only on the default export
    assert.strictEqual(instance.mergeConfig, undefined);
    // @ts-expect-error TS2339 -- isCancel exists only on the default export
    assert.strictEqual(instance.isCancel, undefined);
    // @ts-expect-error TS2339 -- HttpStatusCode exists only on the default export
    assert.strictEqual(instance.HttpStatusCode, undefined);
  });

  it("no longer has interceptors", () => {
    // @ts-expect-error TS2339 -- interceptors were removed in favour of use()
    const removed: unknown = faxios.interceptors;
    assert.strictEqual(removed, undefined);
  });

  it("rejects the removed transitional.legacyInterceptorReqResOrdering option", async () => {
    const fetch = async () => new Response(null, { status: 200 });
    await assert.rejects(
      // @ts-expect-error TS2769 -- legacyInterceptorReqResOrdering was removed with interceptors
      faxios.get("http://localhost/", { transitional: { legacyInterceptorReqResOrdering: true }, env: { fetch } }),
      (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION
    );
  });

  it("should have all/spread helpers", async () => {
    assert.deepStrictEqual(await faxios.all([ Promise.resolve(1), Promise.resolve(2) ]), [ 1, 2 ]);
    assert.deepStrictEqual(faxios.spread((...args) => args)([ 1, 2 ]), [ 1, 2 ]);
  });

  it("does not export spread by name, as the skill and API reference say", () => {
    assert.strictEqual("spread" in root, false);
    assert.strictEqual("all" in root, true);
    assert.strictEqual(typeof faxios.spread, "function");
  });

  it("runs transformRequest on a GET request", async () => {
    let called = 0;
    await faxios.get("http://localhost/", {
      env: { fetch: okFetch },
      transformRequest: [ data => {
        called++;
        return data;
      } ],
    });
    assert.strictEqual(called, 1);
  });

  it("should have factory method", async () => {
    let url = "";
    const fetch = async (input: Request | string | URL) => {
      assert.ok(input instanceof Request);
      url = input.url;
      return new Response(null, { status: 200 });
    };
    await faxios.create({ baseURL: "http://created.test/api/", env: { fetch } }).get("items");

    assert.strictEqual(url, "http://created.test/api/items");
  });

  it("should expose create as a named export", () => {
    assert.strictEqual(create, faxios.create);
  });

  it("attaches the standalone all and formToJSON to the default instance", () => {
    assert.strictEqual(faxios.all, root.all);
    assert.strictEqual(faxios.formToJSON, root.formToJSON);
  });

  it("should have CanceledError and isCancel properties", () => {
    assert.strictEqual(faxios.isCancel(new faxios.Cancel()), true);
    assert.strictEqual(faxios.isCancel(new Error("canceled")), false);
  });

  it("should have getUri method", () => {
    assert.strictEqual(faxios.getUri({ baseURL: "http://localhost/api/", url: "items", params: { a: 1 } }), "http://localhost/api/items?a=1");
  });

  it("should ignore inherited data for bodyless method helpers", async () => {
    // eslint-disable-next-line no-extend-native -- prototype-pollution test; removed in finally
    Object.defineProperty(Object.prototype, "data", {
      value: "inherited-body",
      configurable: true,
    });

    try {
      await Promise.all(
        [ "delete", "get", "head", "options" ].map(async method => {
          let seenBody: BodyInit | null | undefined = "unset";

          const fn = (
            faxios as unknown as Record<
              string,
              (url: string, config: unknown) => Promise<unknown>
            >
          )[method]!;
          await fn("http://localhost/test", {
            env: {
              fetch: async (input: Request | string | URL) => {
                seenBody = (input as Request).body;
                return new Response(null, { status: 200 });
              },
            },
          });

          assert.strictEqual(seenBody, null);
        })
      );
    }
    finally {
      delete (Object.prototype as Record<string, unknown>).data;
    }
  });

  it("should ignore inherited nested serializer fields in getUri", () => {
    let serializeInvoked = false;

    // eslint-disable-next-line no-extend-native -- prototype-pollution test; removed in finally
    Object.defineProperty(Object.prototype, "serialize", {
      value() {
        serializeInvoked = true;
        return "inherited=1";
      },
      configurable: true,
    });

    try {
      assert.strictEqual(
        faxios.getUri({
          url: "/foo",
          params: { value: "a b" },
          paramsSerializer: {},
        }),
        "/foo?value=a+b"
      );
      assert.strictEqual(serializeInvoked, false);
    }
    finally {
      delete (Object.prototype as Record<string, unknown>).serialize;
    }
  });

  it("should have isFaxiosError properties", () => {
    assert.strictEqual(faxios.isFaxiosError(new FaxiosError("Boom!")), true);
    assert.strictEqual(faxios.isFaxiosError(new Error("Boom!")), false);
  });

  it("should have mergeConfig properties", () => {
    const merged = faxios.mergeConfig({ baseURL: "http://a.test/", timeout: 1 }, { timeout: 2 });

    assert.strictEqual(merged.baseURL, "http://a.test/");
    assert.strictEqual(merged.timeout, 2);
  });

  it("should pass symbol keys to transformRequest", async () => {
    const symbolKey = Symbol("example");
    let transformedData;

    await faxios.post(
      "http://localhost/test",
      {
        [symbolKey]: "value",
        stringKey: "value",
      },
      {
        transformRequest(data: unknown) {
          transformedData = data;
          return "";
        },
        env: {
          fetch: async () => new Response(null, { status: 200 }),
        },
      }
    );

    assert.strictEqual(
      (transformedData as unknown as Record<symbol, unknown>)[symbolKey],
      "value"
    );
  });
});

describe("instance api", () => {
  const instance = faxios.create();

  it("should have request methods", async () => {
    assert.deepStrictEqual(await sentByEveryHelper(instance), everyHelperSends);
  });

  it("should have use/eject", async () => {
    assert.deepStrictEqual(await seenByMiddleware(instance), [ "http://localhost/used" ]);
  });

  it("should pass symbol keys to transformRequest through faxios.create", async () => {
    const symbolKey = Symbol("example");
    let transformedData;

    const client = faxios.create({
      transformRequest: [
        data => {
          transformedData = data;
          return "";
        },
      ],
      env: {
        fetch: async () => new Response(null, { status: 200 }),
      },
    });

    await client.post("http://localhost/test", {
      [symbolKey]: "value",
      stringKey: "value",
    });

    assert.strictEqual(
      (transformedData as unknown as Record<string | symbol, unknown>)[
        symbolKey
      ],
      "value"
    );
    assert.strictEqual(
      (transformedData as unknown as Record<string, unknown>).stringKey,
      "value"
    );
  });

  describe("create() child headers", () => {
    const sendsHeader = async (api: FaxiosInstance, method: "get" | "post", name: string) => {
      let sent: null | string = "unsent";
      const fetch = async (_input: unknown, init?: RequestInit) => {
        sent = new Headers(init?.headers).get(name);
        return new Response(null, { status: 200 });
      };
      await api.request({ url: "http://localhost/test", method, env: { fetch } });
      return sent;
    };

    it("lets a child's common header beat the parent's top-level one", async () => {
      const parent = create({ headers: { "X-H": "parent-top" } });
      const child = parent.create({ headers: { common: { "x-h": "child-common" } } });

      assert.strictEqual(await sendsHeader(child, "get", "X-H"), "child-common");
    });

    it("lets a child's method group beat the parent's top-level one for that method only", async () => {
      const parent = create({ headers: { "X-H": "parent-top", common: { "X-H": "parent-common" } } });
      const child = parent.create({ headers: { get: { "X-H": "child-get" } } });

      assert.strictEqual(await sendsHeader(child, "get", "X-H"), "child-get");
      assert.strictEqual(await sendsHeader(child, "post", "X-H"), "parent-top");
    });

    it("sends the same headers as the parent with those headers on the request", async () => {
      const parentHeaders = { "X-A": "parent-top", post: { "X-B": "parent-post" } };
      const childHeaders = { common: { "X-A": "child-common", "X-B": "child-common" } };
      const child = create({ headers: parentHeaders }).create({ headers: childHeaders });
      const parent = create({ headers: parentHeaders });
      const perRequest = async (name: string) => {
        let sent: null | string = null;
        const fetch = async (_input: unknown, init?: RequestInit) => {
          sent = new Headers(init?.headers).get(name);
          return new Response(null, { status: 200 });
        };
        await parent.post("http://localhost/test", undefined, { headers: childHeaders, env: { fetch } });
        return sent;
      };

      assert.strictEqual(await sendsHeader(child, "post", "X-A"), await perRequest("X-A"));
      assert.strictEqual(await sendsHeader(child, "post", "X-B"), await perRequest("X-B"));
    });

    it("skips an own __proto__ key in a parent header group", async () => {
      const common = JSON.parse("{\"__proto__\": {\"X-Polluted\": \"yes\"}, \"X-Kept\": \"parent\"}") as Record<string, string>;
      const parent = create({ headers: { common } });
      const child = parent.create({ headers: { get: { "X-Other": "child" } } });

      const childCommon = child.defaults.headers.common as Record<string, unknown>;
      assert.strictEqual(Object.hasOwn(childCommon, "__proto__"), false);
      assert.strictEqual(childCommon["X-Polluted"], undefined);
      assert.strictEqual(await sendsHeader(child, "get", "X-Kept"), "parent");
      assert.strictEqual(await sendsHeader(child, "get", "X-Polluted"), null);
    });

    for (const [ form, make ] of [
      [ "Headers", () => new Headers({ "X-C": "child", "X-H": "child" }) ],
      [ "Map", () => new Map([[ "X-C", "child" ], [ "X-H", "child" ]]) ],
      [ "pairs", () => [[ "X-C", "child" ], [ "X-H", "child" ]] as Array<[string, string]> ],
    ] as const) {
      it(`keeps the inherited header groups for a child given headers as ${form}`, async () => {
        const parent = create({ headers: { "X-H": "parent-top", common: { Authorization: "parent-auth" } } });
        const child = parent.create({ headers: make() });
        child.defaults.headers.common["X-Set"] = "set";

        assert.strictEqual(await sendsHeader(child, "get", "Accept"), "application/json, text/plain, */*");
        assert.strictEqual(await sendsHeader(child, "get", "Authorization"), "parent-auth");
        assert.strictEqual(await sendsHeader(child, "get", "X-C"), "child");
        assert.strictEqual(await sendsHeader(child, "post", "X-H"), "child");
        assert.strictEqual(await sendsHeader(child, "get", "X-Set"), "set");
      });
    }
  });
});

describe("faxios(url, config)", () => {
  it("does not write url into the caller's config", async () => {
    const config: FaxiosRequestConfig = { env: { fetch: async () => new Response(null, { status: 200 }) } };

    await faxios("http://example.test/a", config);

    assert.strictEqual(Object.hasOwn(config, "url"), false);
  });
});
