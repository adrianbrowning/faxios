import { afterEach, describe, expect, it } from "vitest";

import faxios from "#src/index.js";
import type { InternalFaxiosRequestConfig } from "#src/lib/types.js";

import { installFetchMock } from "./helpers/fetchMock.js";

const setXsrfCookie = (value: string) => {
  document.cookie = `${faxios.defaults.xsrfCookieName}=${value}; path=/`;
};

const clearXsrfCookie = () => {
  document.cookie = `${faxios.defaults.xsrfCookieName}=; expires=${new Date(
    Date.now() - 86400000
  ).toUTCString()}; path=/`;
};

const xsrfHeaderName = faxios.defaults.xsrfHeaderName as string;

describe("xsrf (vitest browser)", () => {
  afterEach(() => {
    clearXsrfCookie();
  });

  it("should not set xsrf header if cookie is null", async () => {
    using mock = installFetchMock();

    await faxios("/foo");

    expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBeNull();
  });

  it("should set xsrf header if cookie is set", async () => {
    using mock = installFetchMock();
    setXsrfCookie("12345");

    await faxios("/foo");

    expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBe("12345");
  });

  it("decodes a percent-encoded xsrf cookie into the header", async () => {
    using mock = installFetchMock();
    setXsrfCookie("a%2Bb");

    await faxios("/foo");

    expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBe("a+b");
  });

  it("sends a malformed percent-encoded xsrf cookie as written", async () => {
    using mock = installFetchMock();
    setXsrfCookie("a%E0%A4%A");

    await faxios("/foo");

    expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBe("a%E0%A4%A");
  });

  it("should not set xsrf header if xsrfCookieName is set to undefined", async () => {
    using mock = installFetchMock();
    setXsrfCookie("12345");

    await faxios("/foo", { xsrfCookieName: undefined });

    expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBeNull();
  });

  it("should not set xsrf header for cross origin", async () => {
    using mock = installFetchMock();
    setXsrfCookie("12345");

    await faxios("http://example.com/");

    expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBeNull();
  });

  it("should not set xsrf header for cross origin when using withCredentials", async () => {
    using mock = installFetchMock();
    setXsrfCookie("12345");

    await faxios("http://example.com/", { withCredentials: true });

    expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBeNull();
  });

  describe("withXSRFToken option", () => {
    it("should set xsrf header for cross origin when withXSRFToken = true", async () => {
      using mock = installFetchMock();
      const token = "12345";
      setXsrfCookie(token);

      await faxios("http://example.com/", { withXSRFToken: true });

      expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBe(token);
    });

    it("should not set xsrf header for the same origin when withXSRFToken = false", async () => {
      using mock = installFetchMock();
      const token = "12345";
      setXsrfCookie(token);

      await faxios("/foo", { withXSRFToken: false });

      expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBeNull();
    });

    it("should send xsrf header cross-origin when the function resolver returns true", async () => {
      using mock = installFetchMock();
      const token = "12345";
      setXsrfCookie(token);

      await faxios("http://example.com/", { withXSRFToken: () => true });

      expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBe(token);
    });

    it("should not set xsrf header same-origin when the function resolver returns false", async () => {
      using mock = installFetchMock();
      setXsrfCookie("12345");

      await faxios("/foo", { withXSRFToken: () => false });

      expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBeNull();
    });

    it("should pass the request config to the function resolver", async () => {
      using _mock = installFetchMock();
      setXsrfCookie("12345");
      const seen: Array<InternalFaxiosRequestConfig> = [];

      await faxios("/foo", {
        params: { flag: "yes" },
        withXSRFToken: (config: InternalFaxiosRequestConfig) => {
          seen.push(config);
          return undefined;
        },
      });

      expect(seen).toHaveLength(1);
      expect(seen[0]!.method).toBe("get");
      expect(seen[0]!.params).toEqual({ flag: "yes" });
    });
  });

  describe("cross-origin targets", () => {
    const otherPort = `${location.protocol}//${location.hostname}:${Number(location.port || (location.protocol === "https:" ? 443 : 80)) + 1}/foo`;
    const otherScheme = `${location.protocol === "https:" ? "http:" : "https:"}//${location.host}/foo`;

    const cases: Array<[string, string, { baseURL?: string; }]> = [
      [ "same host on another port", otherPort, {}],
      [ "same host with the other scheme", otherScheme, {}],
      [ "a //host URL", "//example.com/foo", {}],
      [ "a relative URL with a cross-origin baseURL", "/foo", { baseURL: "http://example.com" }],
    ];

    cases.forEach(([ label, url, config ]) => {
      it(`should not set xsrf header for ${label}`, async () => {
        using mock = installFetchMock();
        setXsrfCookie("12345");

        await faxios(url, config);

        expect(mock.requests).toHaveLength(1);
        expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBeNull();
      });
    });
  });

  describe("redirects", () => {
    it("should refuse redirects when the xsrf header is set and fetchOptions.redirect is unset", async () => {
      using mock = installFetchMock();
      setXsrfCookie("12345");

      await faxios("/foo");

      expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBe("12345");
      expect(mock.lastRequest!.redirect).toBe("error");
    });

    it("should keep a caller-set fetchOptions.redirect when the xsrf header is set", async () => {
      using mock = installFetchMock();
      setXsrfCookie("12345");

      await faxios("/foo", { fetchOptions: { redirect: "follow" } });

      expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBe("12345");
      expect(mock.lastRequest!.redirect).toBe("follow");
    });

    it("should refuse redirects when the xsrf header is set and fetchOptions.redirect is an own undefined", async () => {
      using mock = installFetchMock();
      setXsrfCookie("12345");

      await faxios("/foo", { fetchOptions: { redirect: undefined } });

      expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBe("12345");
      expect(mock.lastRequest!.redirect).toBe("error");
    });

    it("should follow redirects when no xsrf header is set", async () => {
      using mock = installFetchMock();

      await faxios("/foo");

      expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBeNull();
      expect(mock.lastRequest!.redirect).toBe("follow");
    });
  });

  // Non-boolean truthy withXSRFToken must not short-circuit
  // the same-origin check and leak the XSRF token cross-origin.
  describe("non-boolean withXSRFToken", () => {
    afterEach(() => {
      delete (Object.prototype as Record<string, unknown>).withXSRFToken;
    });

    const leakCases = [
      [ "number 1", 1 ],
      [ "string \"false\"", "false" ],
      [ "empty object", {}],
      [ "empty array", []],
    ];

    leakCases.forEach(([ label, value ]) => {
      it(`should not send xsrf header cross-origin when withXSRFToken = ${label}`, async () => {
        using mock = installFetchMock();
        setXsrfCookie("12345");

        await faxios("http://example.com/", {
          withXSRFToken: value as boolean,
        });

        expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBeNull();
      });
    });

    [ 1, true ].forEach(polluted => {
      it(`should not send xsrf header cross-origin when Object.prototype.withXSRFToken = ${String(polluted)}`, async () => {
        using mock = installFetchMock();
        (Object.prototype as Record<string, unknown>).withXSRFToken = polluted;
        setXsrfCookie("12345");

        await faxios("http://example.com/");

        expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBeNull();
      });
    });

    it("should still send xsrf header cross-origin when withXSRFToken === true (strict)", async () => {
      using mock = installFetchMock();
      const token = "12345";
      setXsrfCookie(token);

      await faxios("http://example.com/", { withXSRFToken: true });

      expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBe(token);
    });

    it("should still send xsrf header same-origin when withXSRFToken is undefined", async () => {
      using mock = installFetchMock();
      const token = "12345";
      setXsrfCookie(token);

      await faxios("/foo");

      expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBe(token);
    });
  });
});
