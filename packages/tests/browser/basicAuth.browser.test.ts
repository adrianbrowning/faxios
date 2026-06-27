import { afterEach, beforeEach, describe, expect, it } from "vitest";

import faxios from "#src/index.js";
import type { FaxiosBasicCredentials } from "#src/lib/types.js";

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

  abort() {}
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

describe("basicAuth (vitest browser)", () => {
  beforeEach(() => {
    requests = [];
    OriginalXMLHttpRequest = window.XMLHttpRequest;
    window.XMLHttpRequest =
      MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    window.XMLHttpRequest = OriginalXMLHttpRequest;
  });

  it("should accept HTTP Basic auth with username/password", async () => {
    const { request, promise } = startRequest("/foo", {
      auth: {
        username: "Aladdin",
        password: "open sesame",
      },
    });

    expect(request.requestHeaders.Authorization).toBe(
      "Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ=="
    );

    await flushSuccess(request, promise);
  });

  it("should accept HTTP Basic auth credentials without the password parameter", async () => {
    const { request, promise } = startRequest("/foo", {
      auth: {
        username: "Aladdin",
      } as FaxiosBasicCredentials,
    });

    expect(request.requestHeaders.Authorization).toBe("Basic QWxhZGRpbjo=");

    await flushSuccess(request, promise);
  });

  it("should accept HTTP Basic auth credentials with non-Latin1 characters in password", async () => {
    const { request, promise } = startRequest("/foo", {
      auth: {
        username: "Aladdin",
        password: "open ßç£☃sesame",
      },
    });

    expect(request.requestHeaders.Authorization).toBe(
      "Basic QWxhZGRpbjpvcGVuIMOfw6fCo+KYg3Nlc2FtZQ=="
    );

    await flushSuccess(request, promise);
  });

  it("should ignore inherited nested auth fields", async () => {
    Object.defineProperty(Object.prototype, "username", {
      value: "inherited-user",
      configurable: true,
    });
    Object.defineProperty(Object.prototype, "password", {
      value: "inherited-pass",
      configurable: true,
    });

    try {
      const { request, promise } = startRequest("/foo", {
        auth: {} as FaxiosBasicCredentials,
      });

      expect(request.requestHeaders.Authorization).toBe("Basic Og==");

      await flushSuccess(request, promise);
    }
    finally {
      delete (Object.prototype as Record<string, unknown>).username;
      delete (Object.prototype as Record<string, unknown>).password;
    }
  });

  it("should fail to encode HTTP Basic auth credentials with non-Latin1 characters in username", async () => {
    await expect(
      faxios("/foo", {
        auth: {
          username: "Aladßç£☃din",
          password: "open sesame",
        },
      })
    ).rejects.toThrow(/character/i);
  });
});
