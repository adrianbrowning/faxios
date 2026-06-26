import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import faxios from "../../src/index.js";
import type { RawFaxiosRequestHeaders } from "../../src/lib/types.js";

class MockXMLHttpRequest {
  requestHeaders: Record<string, string> = {};
  responseHeaders = "";
  readyState = 0;
  status = 0;
  statusText = "";
  responseText = "";
  response: string | null = null;
  onreadystatechange: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  upload = { addEventListener() {} };
  method?: string;
  url?: string;
  async?: boolean;
  params?: unknown;

  constructor() {}

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
    return this.responseHeaders;
  }

  send(data: unknown) {
    this.params = data;
    requests.push(this);
  }

  respondWith({
    status = 200,
    statusText = "OK",
    responseText = "",
    responseHeaders = "",
  }: {
    status?: number;
    statusText?: string;
    responseText?: string;
    responseHeaders?: string;
  } = {}) {
    this.status = status;
    this.statusText = statusText;
    this.responseText = responseText;
    this.response = responseText;
    this.responseHeaders = responseHeaders;
    this.readyState = 4;

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

const startRequest = (...args: Parameters<typeof faxios>) => {
  const promise = faxios(...args);
  const request = requests.at(-1);

  expect(request).toBeDefined();

  return { request: request!, promise };
};

const flushSuccess = async (
  request: MockXMLHttpRequest,
  promise: Promise<unknown>
) => {
  request.respondWith({ status: 200 });
  await promise;
};

describe("options (vitest browser)", () => {
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

  it("should default method to get", async () => {
    const { request, promise } = startRequest("/foo");

    expect(request.method).toBe("GET");

    await flushSuccess(request, promise);
  });

  it("should accept headers", async () => {
    const { request, promise } = startRequest("/foo", {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    expect(request.requestHeaders["X-Requested-With"]).toBe("XMLHttpRequest");

    await flushSuccess(request, promise);
  });

  it("should accept params", async () => {
    const { request, promise } = startRequest("/foo", {
      params: {
        foo: 123,
        bar: 456,
      },
    });

    expect(request.url).toBe("/foo?foo=123&bar=456");

    await flushSuccess(request, promise);
  });

  it("should allow overriding default headers", async () => {
    const { request, promise } = startRequest("/foo", {
      headers: {
        Accept: "foo/bar",
      },
    });

    expect(request.requestHeaders.Accept).toBe("foo/bar");

    await flushSuccess(request, promise);
  });

  it("should accept base URL", async () => {
    const instance = faxios.create({
      baseURL: "http://test.com/",
    });

    const promise = instance.get("/foo");
    const request = requests.at(-1);

    expect(request).toBeDefined();
    expect(request!.url).toBe("http://test.com/foo");

    await flushSuccess(request!, promise);
  });

  it("should warn about baseUrl", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const instance = faxios.create({
      // @ts-expect-error intentionally testing misspelled baseUrl to verify warning
      baseUrl: "http://example.com/",
    });

    const promise = instance.get("/foo");
    const request = requests.at(-1);

    expect(request).toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(
      "baseUrl is likely a misspelling of baseURL"
    );
    expect(request!.url).toBe("/foo");

    await flushSuccess(request!, promise);
  });

  it("should ignore base URL if request URL is absolute", async () => {
    const instance = faxios.create({
      baseURL: "http://someurl.com/",
    });

    const promise = instance.get("http://someotherurl.com/");
    const request = requests.at(-1);

    expect(request).toBeDefined();
    expect(request!.url).toBe("http://someotherurl.com/");

    await flushSuccess(request!, promise);
  });

  it("should combine the URLs if base url and request url exist and allowAbsoluteUrls is false", async () => {
    const instance = faxios.create({
      baseURL: "http://someurl.com/",
      allowAbsoluteUrls: false,
    });

    const promise = instance.get("http://someotherurl.com/");
    const request = requests.at(-1);

    expect(request).toBeDefined();
    expect(request!.url).toBe("http://someurl.com/http://someotherurl.com/");

    await flushSuccess(request!, promise);
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
