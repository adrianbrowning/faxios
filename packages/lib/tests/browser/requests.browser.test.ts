import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FaxiosError from "../../../lib/src/lib/core/FaxiosError.js";
import faxios from "../../src/index.js";
import type { FaxiosRequestConfig } from "../../src/lib/types.js";

class MockXMLHttpRequest {
  requestHeaders: Record<string, string> = {};
  responseHeaders: Record<string, string> = {};
  readyState = 0;
  status = 0;
  statusText = "";
  responseText = "";
  response: unknown = null;
  responseURL = "";
  timeout = 0;
  withCredentials = false;
  onreadystatechange: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onerror: ((e: { message: string; }) => void) | null = null;
  ontimeout: (() => void) | null = null;
  upload = { addEventListener() {} };
  method = "";
  url = "";
  async = true;
  params: unknown = null;

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
    return Object.entries(this.responseHeaders)
      .map(([ key, value ]) => `${key}: ${value}`)
      .join("\n");
  }

  send(data: unknown) {
    this.params = data;
    this.readyState = 1;
    requests.push(this);
  }

  respondWith({
    status = 200,
    statusText = "OK",
    responseText = "",
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    response = null as unknown,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    headers = {} as Record<string, string>,
    responseURL = "",
  }: {
    status?: number;
    statusText?: string;
    responseText?: string;
    response?: unknown;
    headers?: Record<string, string>;
    responseURL?: string;
  } = {}) {
    this.status = status;
    this.statusText = statusText;
    this.responseText = responseText;
    this.response = response;
    this.responseHeaders = headers;
    this.responseURL = responseURL;
    this.readyState = 4;
    this.finish();
  }

  responseTimeout() {
    if (this.ontimeout) {
      this.ontimeout();
    }
  }

  failNetworkError(message = "Network Error") {
    if (this.onerror) {
      this.onerror({ message });
    }
  }

  abort() {
    if (this.onabort) {
      this.onabort();
    }
  }

  finish() {
    queueMicrotask(() => {
      if (this.onloadend) {
        this.onloadend();
      }
      else if (this.onreadystatechange) {
        this.onreadystatechange();
      }
    });
  }
}

let requests: Array<MockXMLHttpRequest> = [];
let OriginalXMLHttpRequest: typeof XMLHttpRequest;

const startRequest = (
  urlOrConfig: string | FaxiosRequestConfig,
  config?: FaxiosRequestConfig
) => {
  const promise = typeof urlOrConfig === "string"
    ? faxios(urlOrConfig, config)
    : faxios(urlOrConfig);
  const request = requests.at(-1);
  expect(request).toBeDefined();

  return { request: request as MockXMLHttpRequest, promise };
};

const flushSuccess = async (
  request: MockXMLHttpRequest,
  promise: Promise<unknown>
) => {
  request.respondWith({ status: 200 });
  await promise;
};

describe("requests (vitest browser)", () => {
  beforeEach(() => {
    requests = [];
    OriginalXMLHttpRequest = window.XMLHttpRequest;
    window.XMLHttpRequest =
      MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    window.XMLHttpRequest = OriginalXMLHttpRequest;
    vi.restoreAllMocks();
  });

  it("should treat single string arg as url", async () => {
    const { request, promise } = startRequest("/foo");

    expect(request.url).toBe("/foo");
    expect(request.method).toBe("GET");

    await flushSuccess(request, promise);
  });

  it("should treat method value as lowercase string", async () => {
    const { request, promise } = startRequest({
      url: "/foo",
      method: "POST",
    });

    request.respondWith({ status: 200 });
    const response = await promise;

    expect(response.config.method).toBe("post");
  });

  it("should allow string arg as url, and config arg", async () => {
    const { request, promise } = startRequest("/foo", {
      method: "post",
    });

    expect(request.url).toBe("/foo");
    expect(request.method).toBe("POST");

    await flushSuccess(request, promise);
  });

  it("should allow data", async () => {
    const { request, promise } = startRequest("/foo", {
      method: "delete",
      data: { foo: "bar" },
    });

    expect(request.params).toBe(JSON.stringify({ foo: "bar" }));

    await flushSuccess(request, promise);
  });

  it("should make an http request", async () => {
    const { request, promise } = startRequest("/foo");

    expect(request.url).toBe("/foo");

    await flushSuccess(request, promise);
  });

  describe("timeouts", () => {
    it("should handle timeouts", async () => {
      const { request, promise } = startRequest({
        url: "/foo",
        timeout: 100,
      });

      request.responseTimeout();

      const err = await promise.catch(error => error);

      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe("ECONNABORTED");
    });

    describe("transitional.clarifyTimeoutError", () => {
      it("should throw ETIMEDOUT instead of ECONNABORTED on request timeouts", async () => {
        const { request, promise } = startRequest({
          url: "/foo",
          timeout: 100,
          transitional: {
            clarifyTimeoutError: true,
          },
        });

        request.responseTimeout();

        const err = await promise.catch(error => error);

        expect(err).toBeInstanceOf(Error);
        expect(err.code).toBe("ETIMEDOUT");
      });
    });
  });

  it("should reject on network errors", async () => {
    const { request, promise } = startRequest("http://thisisnotaserver/foo");

    request.failNetworkError();

    const reason = await promise.catch(error => error);

    expect(reason).toBeInstanceOf(Error);
    expect(reason.config.method).toBe("get");
    expect(reason.config.url).toBe("http://thisisnotaserver/foo");
    expect(reason.request).toBeInstanceOf(MockXMLHttpRequest);
  });

  it("rejects malformed HTTP URLs before opening an XHR request", async () => {
    const openSpy = vi.spyOn(MockXMLHttpRequest.prototype, "open");

    const reason = await faxios
      .get("\u0000https:example.com/users", {
        adapter: "xhr",
        headers: {
          "X-Test": "yes",
        },
      })
      .catch(error => error);

    expect(reason).toBeInstanceOf(FaxiosError);
    expect(reason.code).toBe(FaxiosError.ERR_INVALID_URL);
    expect(reason.message).toBe("Invalid URL: missing \"//\" after protocol");
    expect(reason.config.url).toBe("\u0000https:example.com/users");
    expect(reason.config.headers.get("X-Test")).toBe("yes");
    expect(openSpy).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });

  it("should reject on abort", async () => {
    const { request, promise } = startRequest("/foo");

    request.abort();

    const reason = await promise.catch(error => error);

    expect(reason).toBeInstanceOf(Error);
    expect(reason.config.method).toBe("get");
    expect(reason.config.url).toBe("/foo");
    expect(reason.request).toBeInstanceOf(MockXMLHttpRequest);
  });

  it("should reject when validateStatus returns false", async () => {
    const { request, promise } = startRequest("/foo", {
      validateStatus(status: number) {
        return status !== 500;
      },
    });

    request.respondWith({ status: 500 });
    const reason = await promise.catch(error => error);

    expect(reason).toBeInstanceOf(Error);
    expect(reason.message).toBe("Request failed with status code 500");
    expect(reason.config.method).toBe("get");
    expect(reason.config.url).toBe("/foo");
    expect(reason.response.status).toBe(500);
  });

  it("should resolve when validateStatus returns true", async () => {
    const { request, promise } = startRequest("/foo", {
      validateStatus(status: number) {
        return status === 500;
      },
    });

    request.respondWith({ status: 500 });
    await expect(promise).resolves.toBeDefined();
  });

  it("should resolve when the response status is 0 (file protocol)", async () => {
    const { request, promise } = startRequest("file:///xxx");

    request.respondWith({
      status: 0,
      responseURL: "file:///xxx",
    });

    await expect(promise).resolves.toBeDefined();
  });

  it("should resolve when validateStatus is null", async () => {
    const { request, promise } = startRequest("/foo", {
      validateStatus: null,
    });

    request.respondWith({ status: 500 });
    await expect(promise).resolves.toBeDefined();
  });

  it("should resolve when validateStatus is undefined by default", async () => {
    const { request, promise } = startRequest("/foo", {
      validateStatus: undefined,
    });

    request.respondWith({ status: 500 });
    await expect(promise).resolves.toBeDefined();
  });

  // https://github.com/axios/axios/issues/6688
  it("should reject when validateStatus is undefined and the transitional option is disabled", async () => {
    const { request, promise } = startRequest("/foo", {
      validateStatus: undefined,
      transitional: { validateStatusUndefinedResolves: false },
    });

    request.respondWith({ status: 500 });
    const reason = await promise.catch(error => error);

    expect(reason).toBeInstanceOf(Error);
    expect(reason.message).toBe("Request failed with status code 500");
    expect(reason.config.method).toBe("get");
    expect(reason.config.url).toBe("/foo");
    expect(reason.response.status).toBe(500);
  });

  // https://github.com/axios/axios/issues/378
  it("should return JSON when rejecting", async () => {
    const { request, promise } = startRequest("/api/account/signup", {
      method: "post",
      data: { username: null, password: null },
      headers: {
        Accept: "application/json",
      },
    });

    request.respondWith({
      status: 400,
      statusText: "Bad Request",
      responseText: "{\"error\": \"BAD USERNAME\", \"code\": 1}",
    });

    const error = await promise.catch(err => err);
    const response = error.response;

    const data = response.data as Record<string, unknown>;
    expect(typeof data).toBe("object");
    expect(data.error).toBe("BAD USERNAME");
    expect(data.code).toBe(1);
  });

  it("should make cross domain http request", async () => {
    const { request, promise } = startRequest("www.someurl.com/foo", {
      method: "post",
    });

    request.respondWith({
      status: 200,
      statusText: "OK",
      responseText: "{\"foo\": \"bar\"}",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const response = await promise;

    expect((response.data as Record<string, unknown>).foo).toBe("bar");
    expect(response.status).toBe(200);
    expect(response.statusText).toBe("OK");
    expect(response.headers["content-type"]).toBe("application/json");
  });

  it("should supply correct response", async () => {
    const { request, promise } = startRequest("/foo", {
      method: "post",
    });

    request.respondWith({
      status: 200,
      statusText: "OK",
      responseText: "{\"foo\": \"bar\"}",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const response = await promise;

    expect((response.data as Record<string, unknown>).foo).toBe("bar");
    expect(response.status).toBe(200);
    expect(response.statusText).toBe("OK");
    expect(response.headers["content-type"]).toBe("application/json");
  });

  it("should not modify the config url with relative baseURL", async () => {
    const { request, promise } = startRequest("/foo", {
      baseURL: "/api",
    });

    request.respondWith({
      status: 404,
      statusText: "NOT FOUND",
      responseText: "Resource not found",
    });

    const error = await promise.catch(err => err);
    const config = error.config;

    expect(config.baseURL).toBe("/api");
    expect(config.url).toBe("/foo");
  });

  it("should allow overriding Content-Type header case-insensitive", async () => {
    const contentType = "application/vnd.myapp.type+json";
    const { request, promise } = startRequest("/foo", {
      method: "post",
      data: { prop: "value" },
      headers: {
        "Content-Type": contentType,
      },
    });

    expect(request.requestHeaders["Content-Type"]).toBe(contentType);
    await flushSuccess(request, promise);
  });

  it("should support binary data as array buffer", async () => {
    const input = new Int8Array([ 1, 2 ]);
    const { request, promise } = startRequest("/foo", {
      method: "post",
      data: input.buffer,
    });

    const output = new Int8Array(request.params as ArrayBuffer);
    expect(output.length).toBe(2);
    expect(output[0]).toBe(1);
    expect(output[1]).toBe(2);

    await flushSuccess(request, promise);
  });

  it("should support binary data as array buffer view", async () => {
    const input = new Int8Array([ 1, 2 ]);
    const { request, promise } = startRequest("/foo", {
      method: "post",
      data: input,
    });

    const output = new Int8Array(request.params as ArrayBuffer);
    expect(output.length).toBe(2);
    expect(output[0]).toBe(1);
    expect(output[1]).toBe(2);

    await flushSuccess(request, promise);
  });

  it("should support array buffer response", async () => {
    const str2ab = (str: string) => {
      const buff = new ArrayBuffer(str.length * 2);
      const view = new Uint16Array(buff);

      for (let i = 0; i < str.length; i++) {
        view[i] = str.charCodeAt(i);
      }

      return buff;
    };

    const { request, promise } = startRequest("/foo", {
      responseType: "arraybuffer",
    });

    request.respondWith({
      status: 200,
      response: str2ab("Hello world"),
    });

    const response = await promise;
    expect((response.data as ArrayBuffer).byteLength).toBe(22);
  });

  it("should support URLSearchParams", async () => {
    const params = new URLSearchParams();
    params.append("param1", "value1");
    params.append("param2", "value2");

    const { request, promise } = startRequest("/foo", {
      method: "post",
      data: params,
    });

    expect(request.requestHeaders["Content-Type"]).toBe(
      "application/x-www-form-urlencoded;charset=utf-8"
    );
    expect(request.params).toBe("param1=value1&param2=value2");

    await flushSuccess(request, promise);
  });

  it("should support HTTP protocol", async () => {
    const { request, promise } = startRequest("/foo", {
      method: "get",
    });

    expect(request.method).toBe("GET");
    await flushSuccess(request, promise);
  });

  it("should support HTTPS protocol", async () => {
    const { request, promise } = startRequest("https://www.google.com", {
      method: "get",
    });

    expect(request.method).toBe("GET");
    await flushSuccess(request, promise);
  });

  it("should return unsupported protocol error message", async () => {
    await expect(faxios.get("ftp:localhost")).rejects.toMatchObject({
      message: "Unsupported protocol ftp:",
    });
  });
});
