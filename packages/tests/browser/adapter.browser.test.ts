import { afterEach, beforeEach, describe, expect, it } from "vitest";

import faxios from "#src/index.js";

class MockXMLHttpRequest {
  readyState: number;
  status: number;
  statusText: string;
  responseText: string;
  response: unknown;
  onreadystatechange: (() => void) | null;
  onloadend: (() => void) | null;
  upload: { addEventListener: () => void; };
  requestHeaders: Record<string, string>;
  method?: string;
  url?: string;
  async?: boolean;
  params?: unknown;

  constructor() {
    this.readyState = 0;
    this.status = 0;
    this.statusText = "";
    this.responseText = "";
    this.response = null;
    this.onreadystatechange = null;
    this.onloadend = null;
    this.upload = {
      addEventListener() {},
    };
    this.requestHeaders = {};
  }

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

  send(data: unknown) {
    this.params = data;
    requests.push(this);
  }

  respondWith({ status = 200, statusText = "OK", responseText = "" } = {}) {
    this.status = status;
    this.statusText = statusText;
    this.responseText = responseText;
    this.response = responseText;
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

const sleep = async (ms = 0) =>
  new Promise(resolve => setTimeout(resolve, ms));

const waitForRequest = async (timeoutMs = 1000) => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const request = requests.at(-1);
    if (request) {
      return request;
    }

    await sleep(0);
  }

  throw new Error("Expected an XHR request to be sent");
};

describe("adapter (vitest browser)", () => {
  beforeEach(() => {
    requests = [];
    OriginalXMLHttpRequest = window.XMLHttpRequest;
    window.XMLHttpRequest =
      MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    window.XMLHttpRequest = OriginalXMLHttpRequest;
    faxios.interceptors.request.handlers = [];
    faxios.interceptors.response.handlers = [];
  });

  it("should support custom adapter", async () => {
    const responsePromise = faxios("/foo", {
      async adapter(config) {
        return new Promise(resolve => {
          const request = new XMLHttpRequest();
          request.open("GET", "/bar");

          request.onreadystatechange = function onReadyStateChange() {
            resolve({
              data: null,
              status: request.status,
              statusText: request.statusText,
              headers: { get: () => null },
              config,
              request,
            });
          };

          request.send(null);
        });
      },
    });

    const request = await waitForRequest();
    expect(request.url).toBe("/bar");

    request.respondWith();
    await responsePromise;
  });

  it("should execute adapter code synchronously", async () => {
    let asyncFlag = false;

    const responsePromise = faxios("/foo", {
      async adapter(config) {
        return new Promise(resolve => {
          const request = new XMLHttpRequest();
          request.open("GET", "/bar");

          request.onreadystatechange = function onReadyStateChange() {
            resolve({
              data: null,
              status: request.status,
              statusText: request.statusText,
              headers: { get: () => null },
              config,
              request,
            });
          };

          expect(asyncFlag).toBe(false);
          request.send(null);
        });
      },
    });

    asyncFlag = true;

    const request = await waitForRequest();
    request.respondWith();
    await responsePromise;
  });

  it("should execute adapter code asynchronously when interceptor is present", async () => {
    let asyncFlag = false;

    faxios.interceptors.request.use(config => {
      config.headers.async = "async it!";
      return config;
    });

    const responsePromise = faxios("/foo", {
      async adapter(config) {
        return new Promise(resolve => {
          const request = new XMLHttpRequest();
          request.open("GET", "/bar");

          request.onreadystatechange = function onReadyStateChange() {
            resolve({
              data: null,
              status: request.status,
              statusText: request.statusText,
              headers: { get: () => null },
              config,
              request,
            });
          };

          expect(asyncFlag).toBe(true);
          request.send(null);
        });
      },
    });

    asyncFlag = true;

    const request = await waitForRequest();
    request.respondWith();
    await responsePromise;
  });

  it("should sanitize request headers containing CRLF characters", async () => {
    const responsePromise = faxios("/foo", {
      headers: {
        "x-test": "\tok\r\nInjected: yes ",
      },
    });

    const request = await waitForRequest();

    expect(request.requestHeaders["x-test"]).toBe("okInjected: yes");
    expect(request.requestHeaders.Injected).toBeUndefined();

    request.respondWith();
    await responsePromise;
  });
});
