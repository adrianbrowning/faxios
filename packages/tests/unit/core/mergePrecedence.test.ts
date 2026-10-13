import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import faxios from "#src/index.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import type { FaxiosInstance } from "#src/lib/faxios.js";
import type { FaxiosRequestConfig, FaxiosResponse } from "#src/lib/types.js";

type FetchMock = Mock<(input: Request | string | URL, init?: RequestInit) => Promise<Response>>;

const okFetch = (status = 200): FetchMock => vi.fn(async () => new Response("ok", { status }));

const sentRequest = (fetch: FetchMock): Request => {
  const input = fetch.mock.calls[0]![0];
  if (!(input instanceof Request)) throw new Error("fetch was not called with a Request");
  return input;
};

// Lowest to highest precedence. Each level sets X-Level to its own name.
const LEVELS = [
  { name: "instance common", instance: true, headers: { common: { "X-Level": "instance common" } } },
  { name: "instance method", instance: true, headers: { get: { "X-Level": "instance method" } } },
  { name: "instance top-level", instance: true, headers: { "X-Level": "instance top-level" } },
  { name: "request common", instance: false, headers: { common: { "X-Level": "request common" } } },
  { name: "request method", instance: false, headers: { get: { "X-Level": "request method" } } },
  { name: "request top-level", instance: false, headers: { "X-Level": "request top-level" } },
] as const;

const PAIRS = LEVELS.flatMap((low, i) => LEVELS.slice(i + 1).map(high => [ low.name, high.name, low, high ] as const));

describe("core::Faxios config merge precedence", () => {
  describe("headers", () => {
    it.each(PAIRS)("%s loses to %s", async (_low, _high, low, high) => {
      const fetch = okFetch();
      const instanceHeaders = { ...(low.instance ? low.headers : {}), ...(high.instance ? high.headers : {}) };
      const requestHeaders = { ...(low.instance ? {} : low.headers), ...(high.instance ? {} : high.headers) };
      const api = faxios.create({ env: { fetch }, headers: instanceHeaders });
      await api.get("http://example.test/", { headers: requestHeaders });
      expect(sentRequest(fetch).headers.get("X-Level")).toBe(high.name);
    });

    it("sends the token the config-defaults example sets after create()", async () => {
      const fetch = okFetch();
      const instance = faxios.create({ env: { fetch }, headers: { Authorization: "foobar" } });
      instance.defaults.headers["Authorization"] = "Bearer my-token";
      await instance.get("http://example.test/");
      expect(sentRequest(fetch).headers.get("Authorization")).toBe("Bearer my-token");
    });

    it("lets the instance's top-level header beat its common group", async () => {
      const fetch = okFetch();
      const instance = faxios.create({ env: { fetch }, headers: { Authorization: "foobar" } });
      instance.defaults.headers.common["Authorization"] = "Bearer my-token";
      await instance.get("http://example.test/");
      expect(sentRequest(fetch).headers.get("Authorization")).toBe("foobar");
    });

    it.each([ null, false ] as const)("lets a request header replace an instance header set to %s", async value => {
      const fetch = okFetch();
      const api = faxios.create({ env: { fetch }, headers: { "X-A": value } });
      await api.get("http://example.test/", { headers: { common: { "X-A": "request" } } });
      expect(sentRequest(fetch).headers.get("X-A")).toBe("request");
    });

    it("removes an instance header the request sets to null or undefined", async () => {
      const fetch = okFetch();
      const api = faxios.create({ env: { fetch }, headers: { "X-A": "a", common: { "X-B": "b" } } });
      await api.get("http://example.test/", { headers: { "X-A": null, "X-B": undefined } });
      expect(sentRequest(fetch).headers.get("X-A")).toBeNull();
      expect(sentRequest(fetch).headers.get("X-B")).toBeNull();
    });
  });

  describe("an own undefined value", () => {
    const calls: Array<[string, (api: FaxiosInstance, config: FaxiosRequestConfig) => Promise<FaxiosResponse>]> = [
      [ "request()", async (api, config) => api.request({ url: "/a", method: "post", data: { x: 1 }, ...config }) ],
      [ "get()", async (api, config) => api.get("/a", config) ],
      [ "post()", async (api, config) => api.post("/a", { x: 1 }, config) ],
    ];
    const bodyCalls = calls.filter(([ name ]) => name !== "get()");

    it.each(calls)("falls back to the instance baseURL through %s", async (_name, call) => {
      const fetch = okFetch();
      const api = faxios.create({ env: { fetch }, baseURL: "http://example.test/base/" });
      await call(api, { baseURL: undefined });
      expect(sentRequest(fetch).url).toBe("http://example.test/base/a");
    });

    it.each(bodyCalls)("falls back to the instance transformRequest through %s", async (_name, call) => {
      const fetch = okFetch();
      const api = faxios.create({ env: { fetch }, baseURL: "http://example.test/" });
      await call(api, { transformRequest: undefined });
      const request = sentRequest(fetch);
      expect(request.headers.get("Content-Type")).toBe("application/json");
      expect(await request.text()).toBe("{\"x\":1}");
    });

    it.each(calls)("still clears xsrfHeaderName through %s, where clearing is meaningful", async (_name, call) => {
      const fetch = okFetch();
      const api = faxios.create({ env: { fetch }, baseURL: "http://example.test/" });
      const res = await call(api, { xsrfHeaderName: undefined });
      expect(res.config.xsrfHeaderName).toBeUndefined();
    });
  });

  describe("validateStatus", () => {
    it("rejects a 503 when validateStatus is an own undefined", async () => {
      const fetch = okFetch(503);
      const api = faxios.create({ env: { fetch } });
      const err: unknown = await api.get("http://example.test/", { validateStatus: undefined }).then(
        () => { throw new Error("request unexpectedly resolved"); },
        (e: unknown) => e
      );
      expect((err as FaxiosError).code).toBe(FaxiosError.ERR_BAD_RESPONSE);
    });

    it("resolves every status with validateStatus: null", async () => {
      const fetch = okFetch(503);
      const api = faxios.create({ env: { fetch } });
      const res = await api.get("http://example.test/", { validateStatus: null });
      expect(res.status).toBe(503);
    });
  });
});
