import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import axios from "../../src/index.js";
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from "../../src/lib/types.js";
import cookies from "../../../lib/src/lib/helpers/cookies.js";

class MockXMLHttpRequest {
  requestHeaders: Record<string, string> = {};
  readyState = 0;
  status = 200;
  statusText = "OK";
  responseText = "";
  timeout = 0;
  onreadystatechange: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  upload = {
    addEventListener() {},
  };
  method = "";
  url = "";
  async = true;

  open(method: string, url: string, async = true) {
    this.method = method;
    this.url = url;
    this.async = async;
  }

  setRequestHeader(key: string, value: string) {
    this.requestHeaders[key] = value;
  }

  addEventListener() {}

  getAllResponseHeaders() {
    return "";
  }

  send() {
    requests.push(this);
    this.readyState = 4;

    queueMicrotask(() => {
      if (this.onloadend) {
        this.onloadend();
      } else if (this.onreadystatechange) {
        this.onreadystatechange();
      }
    });
  }

  abort() {}
}

let requests: MockXMLHttpRequest[] = [];
let OriginalXMLHttpRequest: typeof XMLHttpRequest;

const setXsrfCookie = (value: string) => {
  document.cookie = `${axios.defaults.xsrfCookieName}=${value}; path=/`;
};

const clearXsrfCookie = () => {
  document.cookie = `${axios.defaults.xsrfCookieName}=; expires=${new Date(
    Date.now() - 86400000,
  ).toUTCString()}; path=/`;
};

const sendRequest = async (url: string, config?: AxiosRequestConfig) => {
  const responsePromise = axios(url, config);
  const request = requests.at(-1);

  expect(request).toBeDefined();
  await responsePromise;

  return request as MockXMLHttpRequest;
};

describe("xsrf (vitest browser)", () => {
  beforeEach(() => {
    requests = [];
    OriginalXMLHttpRequest = window.XMLHttpRequest;
    window.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    clearXsrfCookie();
    window.XMLHttpRequest = OriginalXMLHttpRequest;
    vi.restoreAllMocks();
  });

  it("should not set xsrf header if cookie is null", async () => {
    const request = await sendRequest("/foo");

    expect(
      request.requestHeaders[axios.defaults.xsrfHeaderName as string],
    ).toBeUndefined();
  });

  it("should set xsrf header if cookie is set", async () => {
    setXsrfCookie("12345");

    const request = await sendRequest("/foo");

    expect(request.requestHeaders[axios.defaults.xsrfHeaderName as string]).toBe("12345");
  });

  it("should not set xsrf header if xsrfCookieName is null", async () => {
    setXsrfCookie("12345");

    const request = await sendRequest("/foo", {
      xsrfCookieName: null,
    });

    expect(
      request.requestHeaders[axios.defaults.xsrfHeaderName as string],
    ).toBeUndefined();
  });

  it("should not read cookies at all if xsrfCookieName is null", async () => {
    const readSpy = vi.spyOn(cookies, "read");

    await sendRequest("/foo", {
      xsrfCookieName: null,
    });

    expect(readSpy).not.toHaveBeenCalled();
  });

  it("should not set xsrf header for cross origin", async () => {
    setXsrfCookie("12345");

    const request = await sendRequest("http://example.com/");

    expect(
      request.requestHeaders[axios.defaults.xsrfHeaderName as string],
    ).toBeUndefined();
  });

  it("should not set xsrf header for cross origin when using withCredentials", async () => {
    setXsrfCookie("12345");

    const request = await sendRequest("http://example.com/", {
      withCredentials: true,
    });

    expect(
      request.requestHeaders[axios.defaults.xsrfHeaderName as string],
    ).toBeUndefined();
  });

  describe("withXSRFToken option", () => {
    it("should set xsrf header for cross origin when withXSRFToken = true", async () => {
      const token = "12345";

      setXsrfCookie(token);

      const request = await sendRequest("http://example.com/", {
        withXSRFToken: true,
      });

      expect(request.requestHeaders[axios.defaults.xsrfHeaderName as string]).toBe(token);
    });

    it("should not set xsrf header for the same origin when withXSRFToken = false", async () => {
      const token = "12345";

      setXsrfCookie(token);

      const request = await sendRequest("/foo", {
        withXSRFToken: false,
      });

      expect(
        request.requestHeaders[axios.defaults.xsrfHeaderName as string],
      ).toBeUndefined();
    });

    it("should support function resolver", async () => {
      const token = "12345";

      setXsrfCookie(token);

      const request = await sendRequest("/foo", {
        withXSRFToken: (config: InternalAxiosRequestConfig) => (config as InternalAxiosRequestConfig & { userFlag: string }).userFlag === "yes",
        userFlag: "yes",
      } as AxiosRequestConfig);

      expect(request.requestHeaders[axios.defaults.xsrfHeaderName as string]).toBe(token);
    });
  });

  // Non-boolean truthy withXSRFToken must not short-circuit
  // the same-origin check and leak the XSRF token cross-origin.
  describe("non-boolean withXSRFToken", () => {
    afterEach(() => {
      delete (Object.prototype as Record<string, unknown>).withXSRFToken;
    });

    const leakCases = [
      ["number 1", 1],
      ['string "false"', "false"],
      ["empty object", {}],
      ["empty array", []],
    ];

    leakCases.forEach(([label, value]) => {
      it(`should not send xsrf header cross-origin when withXSRFToken = ${label}`, async () => {
        setXsrfCookie("12345");

        const request = await sendRequest("http://example.com/", {
          withXSRFToken: value as boolean,
        });

        expect(
          request.requestHeaders[axios.defaults.xsrfHeaderName as string],
        ).toBeUndefined();
      });
    });

    it("should not send xsrf header cross-origin when Object.prototype.withXSRFToken is polluted", async () => {
      (Object.prototype as Record<string, unknown>).withXSRFToken = 1;
      setXsrfCookie("12345");

      const request = await sendRequest("http://example.com/");

      expect(
        request.requestHeaders[axios.defaults.xsrfHeaderName as string],
      ).toBeUndefined();
    });

    it("should still send xsrf header cross-origin when withXSRFToken === true (strict)", async () => {
      const token = "12345";
      setXsrfCookie(token);

      const request = await sendRequest("http://example.com/", {
        withXSRFToken: true,
      });

      expect(request.requestHeaders[axios.defaults.xsrfHeaderName as string]).toBe(token);
    });

    it("should still send xsrf header same-origin when withXSRFToken is undefined", async () => {
      const token = "12345";
      setXsrfCookie(token);

      const request = await sendRequest("/foo");

      expect(request.requestHeaders[axios.defaults.xsrfHeaderName as string]).toBe(token);
    });
  });
});
