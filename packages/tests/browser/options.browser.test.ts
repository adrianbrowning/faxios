import { afterEach, describe, expect, it, vi } from "vitest";

import faxios from "#src/index.js";
import type { RawFaxiosRequestHeaders } from "#src/lib/types.js";

import { installFetchMock } from "./helpers/fetchMock.js";

describe("options (vitest browser)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should default method to get", async () => {
    using mock = installFetchMock();

    await faxios("/foo");

    expect(mock.lastRequest!.method).toBe("GET");
  });

  it("should accept headers", async () => {
    using mock = installFetchMock();

    await faxios("/foo", {
      headers: {
        "X-Requested-With": "fetch",
      },
    });

    expect(mock.lastRequest!.headers.get("X-Requested-With")).toBe("fetch");
  });

  it("should accept params", async () => {
    using mock = installFetchMock();

    await faxios("/foo", {
      params: {
        foo: 123,
        bar: 456,
      },
    });

    const url = new URL(mock.lastRequest!.url);
    expect(url.pathname).toBe("/foo");
    expect(url.search).toBe("?foo=123&bar=456");
  });

  it("should allow overriding default headers", async () => {
    using mock = installFetchMock();

    await faxios("/foo", {
      headers: {
        Accept: "foo/bar",
      },
    });

    expect(mock.lastRequest!.headers.get("Accept")).toBe("foo/bar");
  });

  it("should accept base URL", async () => {
    using mock = installFetchMock();
    const instance = faxios.create({
      baseURL: "http://test.com/",
    });

    await instance.get("/foo");

    expect(mock.lastRequest!.url).toBe("http://test.com/foo");
  });

  it("should warn about baseUrl", async () => {
    using mock = installFetchMock();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const instance = faxios.create({
      // @ts-expect-error intentionally testing misspelled baseUrl to verify warning
      baseUrl: "http://example.com/",
    });

    await instance.get("/foo");

    expect(warnSpy).toHaveBeenCalledWith(
      "baseUrl is likely a misspelling of baseURL"
    );
    expect(new URL(mock.lastRequest!.url).pathname).toBe("/foo");
  });

  it("should ignore base URL if request URL is absolute and allowAbsoluteUrls is true", async () => {
    using mock = installFetchMock();
    const instance = faxios.create({
      baseURL: "http://someurl.com/",
      allowAbsoluteUrls: true,
    });

    await instance.get("http://someotherurl.com/");

    expect(mock.lastRequest!.url).toBe("http://someotherurl.com/");
  });

  it("should combine the URLs if base url and request url exist and allowAbsoluteUrls is false", async () => {
    using mock = installFetchMock();
    const instance = faxios.create({
      baseURL: "http://someurl.com/",
      allowAbsoluteUrls: false,
    });

    await instance.get("http://someotherurl.com/");

    expect(mock.lastRequest!.url).toBe(
      "http://someurl.com/http://someotherurl.com/"
    );
  });

  it("should change only the baseURL of the specified instance", () => {
    const instance1 = faxios.create();
    const instance2 = faxios.create();

    instance1.defaults.baseURL = "http://instance1.example.com/";

    expect(instance2.defaults.baseURL).not.toBe(
      "http://instance1.example.com/"
    );
  });

  it("should change only the headers of the specified instance", () => {
    const instance1 = faxios.create();
    const instance2 = faxios.create();

    (
      instance1.defaults.headers.common as RawFaxiosRequestHeaders
    ).Authorization = "faketoken";
    (
      instance2.defaults.headers.common as RawFaxiosRequestHeaders
    ).Authorization = "differentfaketoken";

    (instance1.defaults.headers.common as RawFaxiosRequestHeaders)[
      "Content-Type"
    ] = "application/xml";
    (instance2.defaults.headers.common as RawFaxiosRequestHeaders)[
      "Content-Type"
    ] = "application/x-www-form-urlencoded";

    expect(
      (faxios.defaults.headers.common as RawFaxiosRequestHeaders).Authorization
    ).toBeUndefined();
    expect(
      (instance1.defaults.headers.common as RawFaxiosRequestHeaders)
        .Authorization
    ).toBe("faketoken");
    expect(
      (instance2.defaults.headers.common as RawFaxiosRequestHeaders)
        .Authorization
    ).toBe("differentfaketoken");

    expect(
      (faxios.defaults.headers.common as RawFaxiosRequestHeaders)[
        "Content-Type"
      ]
    ).toBeUndefined();
    expect(
      (instance1.defaults.headers.common as RawFaxiosRequestHeaders)[
        "Content-Type"
      ]
    ).toBe("application/xml");
    expect(
      (instance2.defaults.headers.common as RawFaxiosRequestHeaders)[
        "Content-Type"
      ]
    ).toBe("application/x-www-form-urlencoded");
  });
});
