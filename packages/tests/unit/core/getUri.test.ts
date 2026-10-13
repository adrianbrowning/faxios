import assert from "node:assert";
import { describe, it } from "vitest";
import faxios from "#src/index.ts";
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

      const sent = await sentURL(instance, config).then(url => ({ url }), (error: unknown) => ({ error }));
      if ("error" in sent) {
        assert.throws(() => instance.getUri(config), { code: "ERR_INVALID_URL" });
        assert.deepStrictEqual((sent.error as { code?: unknown; }).code, "ERR_INVALID_URL");
      }
      else {
        assert.strictEqual(instance.getUri(config), sent.url);
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
