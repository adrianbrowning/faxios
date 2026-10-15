import assert from "node:assert";
import { describe, it } from "vitest";
import faxios, { resolveRequestURL } from "#src/index.ts";
import type { FaxiosInstance, FaxiosRequestConfig } from "#src/index.ts";

async function sentURL(instance: FaxiosInstance, config: FaxiosRequestConfig): Promise<string> {
  let captured = "";
  await instance.request({
    ...config,
    env: {
      fetch: async (input: Request | string | URL) => {
        captured = input instanceof Request ? input.url : String(input);
        return new Response(null, { status: 200 });
      },
    },
  });
  return captured;
}

const instanceBaseURLs = [ "https://api.example.com/v1", undefined ] as const;
const allowAbsoluteUrlsValues = [ true, false, undefined ] as const;
const urls = [ "/users?a=1", "https://other.example.com/x" ] as const;
const requestBaseURLs = [ undefined, "https://per-request.example.com" ] as const;

const cases = instanceBaseURLs.flatMap(instanceBaseURL =>
  allowAbsoluteUrlsValues.flatMap(instanceAllow =>
    allowAbsoluteUrlsValues.flatMap(requestAllow =>
      urls.flatMap(url =>
        requestBaseURLs.map(requestBaseURL => ({ instanceBaseURL, instanceAllow, requestAllow, url, requestBaseURL }))))))
  // A relative URL with no baseURL at all can't be fetched in Node.
  .filter(c => c.instanceBaseURL !== undefined || c.requestBaseURL !== undefined || c.url.startsWith("http"));

describe("getUri() matches the URL the request sends", () => {
  it.each(cases)(
    "instance baseURL=$instanceBaseURL allowAbsoluteUrls=$instanceAllow; request baseURL=$requestBaseURL allowAbsoluteUrls=$requestAllow url=$url",
    async ({ instanceBaseURL, instanceAllow, requestAllow, url, requestBaseURL }) => {
      const instance = faxios.create(instanceBaseURL === undefined ? {} : { baseURL: instanceBaseURL });
      if (instanceAllow !== undefined) {
        instance.defaults.allowAbsoluteUrls = instanceAllow;
      }
      const config: FaxiosRequestConfig = { url, params: { b: 2 } };
      if (requestAllow !== undefined) {
        config.allowAbsoluteUrls = requestAllow;
      }
      if (requestBaseURL !== undefined) {
        config.baseURL = requestBaseURL;
      }

      // Request allowAbsoluteUrls wins, then the instance's; unset, it is true only without an instance baseURL.
      const allow = requestAllow ?? instanceAllow ?? instanceBaseURL === undefined;
      const baseURL = requestBaseURL ?? instanceBaseURL;
      let expected: string | undefined = `${baseURL}${url}&b=2`;
      if (url.startsWith("http")) {
        expected = baseURL !== undefined && !allow ? undefined : `${url}?b=2`;
      }

      const sent = await sentURL(instance, config).then(url => ({ url }), (error: unknown) => ({ error }));
      if (expected === undefined) {
        assert.throws(() => instance.getUri(config), { code: "ERR_INVALID_URL" });
        assert.ok("error" in sent);
        assert.deepStrictEqual((sent.error as { code?: unknown; }).code, "ERR_INVALID_URL");
      }
      else {
        assert.strictEqual(instance.getUri(config), expected);
        assert.deepStrictEqual(sent, { url: expected });
      }
    }
  );

  it("instance with baseURL: getUri() rejects an absolute url when allowAbsoluteUrls is unset", () => {
    const instance = faxios.create({ baseURL: "https://api.example.com/v1" });
    assert.throws(
      () => instance.getUri({ url: "https://other.example.com/x" }),
      { code: "ERR_INVALID_URL", message: "absolute URL with baseURL; set allowAbsoluteUrls: true" }
    );
  });

  it("instance with baseURL: an absolute url rejects before fetch unless allowAbsoluteUrls is true", async () => {
    const seen: Array<string> = [];
    const fetch = async (input: Request | string | URL) => {
      seen.push(input instanceof Request ? input.url : String(input));
      return new Response(null, { status: 200 });
    };
    const instance = faxios.create({ baseURL: "https://api.example.com/v1", env: { fetch } });
    await assert.rejects(instance.get("https://other.example.com/x"), {
      code: "ERR_INVALID_URL",
      message: "absolute URL with baseURL; set allowAbsoluteUrls: true",
    });
    assert.deepStrictEqual(seen, []);
    await instance.get("https://other.example.com/x", { allowAbsoluteUrls: true });
    assert.deepStrictEqual(seen, [ "https://other.example.com/x" ]);
  });
});

describe("getUri() normalizes the config like a request", () => {
  const url = new URL("https://x.example/a");

  it("accepts a URL instance without a baseURL", async () => {
    const config: FaxiosRequestConfig = { url, params: { q: 1 } };
    assert.strictEqual(faxios.getUri(config), "https://x.example/a?q=1");
    assert.strictEqual(await sentURL(faxios, config), "https://x.example/a?q=1");
  });

  it("accepts a URL instance with a baseURL and allowAbsoluteUrls: true", async () => {
    const instance = faxios.create({ baseURL: "https://api.example.com/v1" });
    const config: FaxiosRequestConfig = { url, params: { q: 1 }, allowAbsoluteUrls: true };
    assert.strictEqual(instance.getUri(config), "https://x.example/a?q=1");
    assert.strictEqual(await sentURL(instance, config), "https://x.example/a?q=1");
  });

  it("rejects a url that is neither a string nor a URL with the request's error", async () => {
    const config = { url: 5 } as unknown as FaxiosRequestConfig;
    const expected = { code: "ERR_BAD_OPTION_VALUE", message: "option url must be a string or URL" };
    assert.throws(() => faxios.getUri(config), expected);
    await assert.rejects(faxios.request(config), expected);
  });

  it("wraps a function paramsSerializer as the request does", async () => {
    const config: FaxiosRequestConfig = { url: "https://x.example/a", params: { q: 1 }, paramsSerializer: () => "custom=1" };
    assert.strictEqual(faxios.getUri(config), "https://x.example/a?custom=1");
    assert.strictEqual(await sentURL(faxios, config), "https://x.example/a?custom=1");
  });

  it("rejects an unknown paramsSerializer key as the request does", async () => {
    const config = { url: "https://x.example/a", params: { a: [ 1 ] }, paramsSerializer: { indexs: true } } as unknown as FaxiosRequestConfig;
    const expected = { code: "ERR_BAD_OPTION", message: "Unknown option indexs" };
    assert.throws(() => faxios.getUri(config), expected);
    await assert.rejects(faxios.request(config), expected);
  });
});

describe("getUri() fills in pathParams", () => {
  it("returns the URL the request sends, with placeholders substituted and encoded", async () => {
    const instance = faxios.create({ baseURL: "https://api.example.com/v1" });
    const config: FaxiosRequestConfig = { url: "/users/{id}/posts/{slug}", pathParams: { id: 42, slug: "a b" }, params: { q: 1 } };

    assert.strictEqual(instance.getUri(config), "https://api.example.com/v1/users/42/posts/a%20b?q=1");
    assert.strictEqual(instance.getUri(config), await sentURL(instance, config));
  });

  it("throws ERR_BAD_OPTION_VALUE for a placeholder missing from pathParams", () => {
    const instance = faxios.create({ baseURL: "https://api.example.com/v1" });
    assert.throws(
      () => instance.getUri({ url: "/users/{id}", pathParams: {} }),
      { code: "ERR_BAD_OPTION_VALUE", message: "Path param \"id\" not found in pathParams" }
    );
  });

  it("leaves placeholders as written when pathParams is not set", () => {
    assert.strictEqual(faxios.getUri({ url: "https://api.example.com/users/{id}" }), "https://api.example.com/users/{id}");
  });
});

describe("resolveRequestURL() gives plugins the URL core sends", () => {
  const BASE = "https://api.example.com/v1/";
  const table: Array<{ config: FaxiosRequestConfig; expected: string; instanceBaseURL?: string; }> = [
    { instanceBaseURL: BASE, config: { url: "projects/p1:run" }, expected: "https://api.example.com/v1/projects/p1:run" },
    { instanceBaseURL: BASE, config: { url: "documents:batchGet" }, expected: "https://api.example.com/v1/documents:batchGet" },
    { instanceBaseURL: BASE, config: { url: "localhost:3000/x" }, expected: "https://api.example.com/v1/localhost:3000/x" },
    { config: { url: "documents:batchGet", baseURL: BASE }, expected: "https://api.example.com/v1/documents:batchGet" },
    { instanceBaseURL: BASE, config: { url: "/users/{id}", pathParams: { id: "a b" }, params: { q: 1 } }, expected: "https://api.example.com/v1/users/a%20b?q=1" },
    { instanceBaseURL: BASE, config: { url: "https://other.example/x", allowAbsoluteUrls: true }, expected: "https://other.example/x" },
    { instanceBaseURL: BASE, config: { url: "/x", baseURL: "https://partner.example" }, expected: "https://partner.example/x" },
    { config: { url: "https://other.example/x" }, expected: "https://other.example/x" },
  ];

  it.each(table)("instance baseURL=$instanceBaseURL config=$config", async ({ instanceBaseURL, config, expected }) => {
    const seen: Array<string> = [];
    const instance = faxios.create(instanceBaseURL === undefined ? {} : { baseURL: instanceBaseURL })
      .use(async (ctx, next) => {
        seen.push(resolveRequestURL(ctx.config));
        return next(ctx);
      });

    assert.strictEqual(instance.getUri(config), expected);
    assert.strictEqual(await sentURL(instance, config), expected);
    assert.deepStrictEqual(seen, [ expected ]);
  });

  it("rejects an absolute URL with an instance baseURL, as core does", async () => {
    const instance = faxios.create({ baseURL: BASE }).use(async (ctx, next) => {
      assert.throws(() => resolveRequestURL(ctx.config), { code: "ERR_INVALID_URL" });
      return next(ctx);
    });

    await assert.rejects(instance.get("https://other.example/x"), { code: "ERR_INVALID_URL" });
  });

  it("sends a URL url as its href, with params", () => {
    const url: string = resolveRequestURL({ url: new URL("https://other.example/a"), params: { q: 1 } });

    assert.strictEqual(url, "https://other.example/a?q=1");
  });

  it("checks a URL url against baseURL like a string one", () => {
    const config = { baseURL: BASE, url: new URL("https://other.example/a") };

    assert.strictEqual(resolveRequestURL(config), "https://other.example/a");
    assert.throws(() => resolveRequestURL({ ...config, allowAbsoluteUrls: false }), { name: "FaxiosError", code: "ERR_INVALID_URL" });
  });

  it("throws ERR_INVALID_URL when there is no url and no baseURL", () => {
    assert.throws(() => resolveRequestURL({}), { name: "FaxiosError", code: "ERR_INVALID_URL" });
  });
});
