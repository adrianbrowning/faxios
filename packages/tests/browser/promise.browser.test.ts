import { afterEach, beforeEach, describe, expect, it } from "vitest";

import faxios from "#src/index.js";

class MockXMLHttpRequest {
  requestHeaders: Record<string, string> = {};
  responseHeaders: string = "";
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

const getLastRequest = () => {
  const request = requests.at(-1);

  expect(request).toBeDefined();

  return request;
};

describe("promise (vitest browser)", () => {
  beforeEach(() => {
    requests = [];
    OriginalXMLHttpRequest = window.XMLHttpRequest;
    window.XMLHttpRequest =
      MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    window.XMLHttpRequest = OriginalXMLHttpRequest;
  });

  it("should provide succinct object to then", async () => {
    const responsePromise = faxios("/foo");
    const request = getLastRequest();

    request!.respondWith({
      status: 200,
      responseText: "{\"hello\":\"world\"}",
      responseHeaders: "Content-Type: application/json",
    });

    const response = await responsePromise;

    expect(typeof response).toBe("object");
    expect((response.data as Record<string, string>).hello).toBe("world");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json");
    expect(response.config.url).toBe("/foo");
  });

  it("should support all", async () => {
    const result = await faxios.all([ true, 123 ] as unknown as Array<
      Promise<unknown>
    >);

    expect(result).toEqual([ true, 123 ]);
  });

  it("should support spread", async () => {
    let fulfilled = false;
    const result = await faxios
      .all([ 123, 456 ] as unknown as Array<Promise<unknown>>)
      .then(
        faxios.spread((...args: Array<unknown>) => {
          const [ a, b ] = args as [number, number];
          expect(a + b).toBe(123 + 456);
          fulfilled = true;
          return "hello world";
        })
      );

    expect(fulfilled).toBe(true);
    expect(result).toBe("hello world");
  });
});
