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

      const expected = await sentURL(instance, config);
      assert.strictEqual(instance.getUri(config), expected);
    }
  );

  it("instance with baseURL: getUri() appends an absolute url to baseURL when allowAbsoluteUrls is unset", () => {
    const instance = faxios.create({ baseURL: "https://api.example.com/v1" });
    assert.strictEqual(
      instance.getUri({ url: "https://other.example.com/x" }),
      "https://api.example.com/v1/https://other.example.com/x"
    );
  });
});
