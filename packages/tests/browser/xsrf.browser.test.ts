import { afterEach, describe, expect, it, vi } from "vitest";

import faxios from "#src/index.js";
import cookies from "#src/lib/helpers/cookies.js";
import type {
  FaxiosRequestConfig,
  InternalFaxiosRequestConfig
} from "#src/lib/types.js";

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
    vi.restoreAllMocks();
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

  it("should not set xsrf header if xsrfCookieName is null", async () => {
    using mock = installFetchMock();
    setXsrfCookie("12345");

    await faxios("/foo", { xsrfCookieName: undefined });

    expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBeNull();
  });

  it("should not read cookies at all if xsrfCookieName is null", async () => {
    using _mock = installFetchMock();
    const readSpy = vi.spyOn(cookies, "read");

    await faxios("/foo", { xsrfCookieName: undefined });

    expect(readSpy).not.toHaveBeenCalled();
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

    it("should support function resolver", async () => {
      using mock = installFetchMock();
      const token = "12345";
      setXsrfCookie(token);

      await faxios("/foo", {
        withXSRFToken: (config: InternalFaxiosRequestConfig) =>
          (config as InternalFaxiosRequestConfig & { userFlag: string; })
            .userFlag === "yes",
        userFlag: "yes",
      } as FaxiosRequestConfig);

      expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBe(token);
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

    it("should not send xsrf header cross-origin when Object.prototype.withXSRFToken is polluted", async () => {
      using mock = installFetchMock();
      (Object.prototype as Record<string, unknown>).withXSRFToken = 1;
      setXsrfCookie("12345");

      await faxios("http://example.com/");

      expect(mock.lastRequest!.headers.get(xsrfHeaderName)).toBeNull();
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
