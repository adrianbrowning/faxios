import { afterEach, beforeEach, describe, expect, it } from "vitest";

import axios from "../../src/index.js";

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
  }: { status?: number; statusText?: string; responseText?: string; responseHeaders?: string } = {}) {
    this.status = status;
    this.statusText = statusText;
    this.responseText = responseText;
    this.response = responseText;
    this.responseHeaders = responseHeaders;
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

const getLastRequest = (): MockXMLHttpRequest => {
  const request = requests.at(-1);

  expect(request).toBeDefined();

  return request!;
};

describe("formdata (vitest browser)", () => {
  beforeEach(() => {
    requests = [];
    OriginalXMLHttpRequest = window.XMLHttpRequest;
    window.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    window.XMLHttpRequest = OriginalXMLHttpRequest;
  });

  it("should allow FormData posting", async () => {
    const responsePromise = (axios as unknown as { postForm: (url: string, data: unknown) => Promise<unknown> }).postForm("/foo", {
      a: "foo",
      b: "bar",
    });
    const request = getLastRequest();

    expect(request.params).toBeInstanceOf(FormData);
    expect(Object.fromEntries((request.params as FormData).entries())).toEqual({
      a: "foo",
      b: "bar",
    });

    request.respondWith({
      status: 200,
      responseText: "{}",
      responseHeaders: "Content-Type: application/json",
    });
    await responsePromise;
  });
});
