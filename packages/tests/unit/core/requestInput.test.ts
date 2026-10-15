import { describe, expect, it, vi } from "vitest";
import faxios from "#src/index.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import FaxiosHeaders from "#src/lib/core/FaxiosHeaders.js";
import type { FaxiosRequestConfig } from "#src/lib/types.js";

const okFetch = () => vi.fn(async (_input: unknown, _init?: unknown) => new Response("ok"));

const expectBadOption = async (promise: Promise<unknown>) => {
  const err: unknown = await promise.then(
    () => { throw new Error("request unexpectedly resolved"); },
    (e: unknown) => e
  );
  expect(faxios.isFaxiosError(err)).toBe(true);
  expect((err as FaxiosError).code).toBe(FaxiosError.ERR_BAD_OPTION_VALUE);
  return err as FaxiosError;
};

describe("core::Faxios request input", () => {
  it("rejects a null config with ERR_BAD_OPTION_VALUE", async () => {
    const fetch = okFetch();
    const api = faxios.create({ url: "http://example.test/", env: { fetch } });
    await expectBadOption(api.request(null as unknown as FaxiosRequestConfig));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a non-object config with ERR_BAD_OPTION_VALUE", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    await expectBadOption(api.request(5 as unknown as FaxiosRequestConfig));
    await expectBadOption(api("http://example.test/", "x" as unknown as FaxiosRequestConfig));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects transitional: null with ERR_BAD_OPTION_VALUE", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    await expectBadOption(api.get("http://example.test/", { transitional: null as unknown as undefined }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a non-string method with ERR_BAD_OPTION_VALUE", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    const err = await expectBadOption(api.request({ url: "http://example.test/", method: 1 as unknown as "get" }));
    expect(err.config).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a method that is not an HTTP token with ERR_BAD_OPTION_VALUE", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    await expectBadOption(api.request({ url: "http://example.test/", method: "GE T" }));
    await expectBadOption(api.request({ url: "http://example.test/", method: "get\r\nx" }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still accepts extension methods that are HTTP tokens", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    await api.request({ url: "http://example.test/", method: "PROPFIND" });
    expect((fetch.mock.calls[0]![1] as RequestInit).method).toBe("PROPFIND");
  });

  it("rejects a url that is neither a string nor a URL with ERR_BAD_OPTION_VALUE", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    await expectBadOption(api.request({ url: 5 as unknown as string }));
    await expectBadOption(api.request({ url: null as unknown as string }));
    await expectBadOption(api.request({ url: {} as unknown as string }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends a request to a URL instance", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    const res = await api.request({ url: new URL("http://example.test/a?b=1"), params: { c: 2 } });
    expect(res.config.url).toBe("http://example.test/a?b=1");
    expect((fetch.mock.calls[0]![0] as Request).url).toBe("http://example.test/a?b=1&c=2");
  });

  it("sends a request to a URL instance passed as the url argument", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    const url = new URL("http://example.test/a?b=1");
    const sent = [
      await api(url),
      await api(url, { method: "delete" }),
      await api.get(url, { params: { c: 2 } }),
      await api.post(url, "body"),
      await api.patchForm(url, { a: "1" }),
    ];
    expect(sent.map(res => res.config.url)).toEqual(Array(5).fill("http://example.test/a?b=1"));
    expect(fetch.mock.calls.map(([ request ]) => [ (request as Request).method, (request as Request).url ])).toEqual([
      [ "GET", "http://example.test/a?b=1" ],
      [ "DELETE", "http://example.test/a?b=1" ],
      [ "GET", "http://example.test/a?b=1&c=2" ],
      [ "POST", "http://example.test/a?b=1" ],
      [ "PATCH", "http://example.test/a?b=1" ],
    ]);
  });
});

describe("core::Faxios errors thrown before dispatch carry the request's config", () => {
  it("an unknown option (ERR_BAD_OPTION) has flattened headers", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch }, headers: { "X-Instance": "i", "X-Both": "instance", "post": { "X-Group": "post" } } });
    const err: FaxiosError = await api.request({
      url: "https://a.example/x",
      method: "POST",
      headers: { "X-Both": "request" },
      unknownKey: 1,
    } as unknown as FaxiosRequestConfig).then(() => { throw new Error("request unexpectedly resolved"); }, (e: unknown) => e as FaxiosError);

    expect(err.code).toBe(FaxiosError.ERR_BAD_OPTION);
    expect(err.config!.headers).toBeInstanceOf(FaxiosHeaders);
    expect(err.config!.headers.get("X-Instance")).toBe("i");
    expect(err.config!.headers.get("X-Both")).toBe("request");
    expect(err.config!.headers.get("X-Group")).toBe("post");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a bad method (ERR_BAD_OPTION_VALUE) has flattened headers and a URL url as its href", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch }, headers: { "X-Instance": "i" } });
    const err = await expectBadOption(api.request({ url: new URL("https://a.example/x"), method: 5 } as unknown as FaxiosRequestConfig));

    expect(err.config!.headers).toBeInstanceOf(FaxiosHeaders);
    expect(err.config!.headers.get("X-Instance")).toBe("i");
    expect(err.config!.url).toBe("https://a.example/x");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("an unknown option wins over a bad url", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    const config = { url: 5, unknownKey: 1 } as unknown as FaxiosRequestConfig;
    const expected = { code: FaxiosError.ERR_BAD_OPTION, message: "Unknown option unknownKey" };

    await expect(api.request(config)).rejects.toMatchObject(expected);
    expect(() => api.getUri(config)).toThrow(expect.objectContaining(expected));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a bad option value from getUri() has flattened headers", () => {
    const api = faxios.create({ headers: { "X-Instance": "i" } });
    let err: FaxiosError | undefined;
    try {
      api.getUri({ url: "https://a.example", responseType: "nope" } as unknown as FaxiosRequestConfig);
    }
    catch (e) {
      err = e as FaxiosError;
    }

    expect(err?.code).toBe(FaxiosError.ERR_BAD_OPTION_VALUE);
    expect(err?.config?.headers).toBeInstanceOf(FaxiosHeaders);
    expect(err?.config?.headers.get("X-Instance")).toBe("i");
  });
});
