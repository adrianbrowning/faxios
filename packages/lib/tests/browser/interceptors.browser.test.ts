import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import faxios from "../../src/index.js";
import type { InternalFaxiosRequestConfig } from "../../src/index.js";

class MockXMLHttpRequest {
  requestHeaders: Record<string, string> = {};
  responseHeaders: string | Record<string, string> = {};
  readyState = 0;
  status = 0;
  statusText = "";
  responseText = "";
  response: string | null = null;
  responseURL = "";
  timeout = 0;
  withCredentials = false;
  onreadystatechange: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  ontimeout: (() => void) | null = null;
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
    if (typeof this.responseHeaders === "string") {
      return this.responseHeaders;
    }

    return Object.entries(this.responseHeaders)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
  }

  send(data: unknown) {
    this.params = data;
    requests.push(this);
    this.readyState = 1;
  }

  respondWith({
    status = 200,
    statusText = "OK",
    responseText = "",
    response = null,
    responseHeaders = {},
    headers = {},
    responseURL = "",
  }: {
    status?: number;
    statusText?: string;
    responseText?: string;
    response?: string | null;
    responseHeaders?: Record<string, string>;
    headers?: Record<string, string>;
    responseURL?: string;
  } = {}) {
    this.status = status;
    this.statusText = statusText;
    this.responseText = responseText;
    this.response = response === null ? responseText : response;
    this.responseHeaders = Object.keys(headers).length
      ? headers
      : responseHeaders;
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
      } else if (this.onreadystatechange) {
        this.onreadystatechange();
      }
    });
  }
}

let requests: Array<MockXMLHttpRequest> = [];
let OriginalXMLHttpRequest: typeof XMLHttpRequest;

const sleep = async (ms = 0) =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

describe("interceptors (vitest browser)", () => {
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
    vi.restoreAllMocks();
  });

  it("should add a request interceptor (asynchronous by default)", async () => {
    let asyncFlag = false;

    faxios.interceptors.request.use((config) => {
      config.headers.test = "added by interceptor";
      expect(asyncFlag).toBe(true);
      return config;
    });

    const responsePromise = faxios("/foo");
    asyncFlag = true;

    const request = await waitForRequest();
    expect(request.requestHeaders.test).toBe("added by interceptor");
    request.respondWith();
    await responsePromise;
  });

  it("should add a request interceptor (explicitly flagged as asynchronous)", async () => {
    let asyncFlag = false;

    faxios.interceptors.request.use(
      (config) => {
        config.headers.test = "added by interceptor";
        expect(asyncFlag).toBe(true);
        return config;
      },
      null,
      { synchronous: false },
    );

    const responsePromise = faxios("/foo");
    asyncFlag = true;

    const request = await waitForRequest();
    expect(request.requestHeaders.test).toBe("added by interceptor");
    request.respondWith();
    await responsePromise;
  });

  it("should add a request interceptor that is executed synchronously when flag is provided", async () => {
    let asyncFlag = false;

    faxios.interceptors.request.use(
      (config) => {
        config.headers.test = "added by synchronous interceptor";
        expect(asyncFlag).toBe(false);
        return config;
      },
      null,
      { synchronous: true },
    );

    const responsePromise = faxios("/foo");
    asyncFlag = true;

    const request = await waitForRequest();
    expect(request.requestHeaders.test).toBe(
      "added by synchronous interceptor",
    );
    request.respondWith();
    await responsePromise;
  });

  it("should execute asynchronously when not all interceptors are explicitly flagged as synchronous", async () => {
    let asyncFlag = false;

    faxios.interceptors.request.use((config) => {
      config.headers.foo = "uh oh, async";
      expect(asyncFlag).toBe(true);
      return config;
    });

    faxios.interceptors.request.use(
      (config) => {
        config.headers.test = "added by synchronous interceptor";
        expect(asyncFlag).toBe(true);
        return config;
      },
      null,
      { synchronous: true },
    );

    faxios.interceptors.request.use((config) => {
      config.headers.test = "added by the async interceptor";
      expect(asyncFlag).toBe(true);
      return config;
    });

    const responsePromise = faxios("/foo");
    asyncFlag = true;

    const request = await waitForRequest();
    expect(request.requestHeaders.foo).toBe("uh oh, async");
    expect(request.requestHeaders.test).toBe(
      "added by synchronous interceptor",
    );
    request.respondWith();
    await responsePromise;
  });

  it("should execute request interceptor in legacy order", async () => {
    let sequence = "";

    faxios.interceptors.request.use((config) => {
      sequence += "1";
      return config;
    });

    faxios.interceptors.request.use((config) => {
      sequence += "2";
      return config;
    });

    faxios.interceptors.request.use((config) => {
      sequence += "3";
      return config;
    });

    const responsePromise = faxios({ url: "/foo" });
    const request = await waitForRequest();

    expect(sequence).toBe("321");
    request.respondWith();
    await responsePromise;
  });

  it("should execute request interceptor in order", async () => {
    let sequence = "";

    faxios.interceptors.request.use((config) => {
      sequence += "1";
      return config;
    });

    faxios.interceptors.request.use((config) => {
      sequence += "2";
      return config;
    });

    faxios.interceptors.request.use((config) => {
      sequence += "3";
      return config;
    });

    const responsePromise = faxios({
      url: "/foo",
      transitional: {
        legacyInterceptorReqResOrdering: false,
      },
    });
    const request = await waitForRequest();

    expect(sequence).toBe("123");
    request.respondWith();
    await responsePromise;
  });

  it("runs the interceptor if runWhen function is provided and resolves to true", async () => {
    const onGetCall = (config: InternalFaxiosRequestConfig) =>
      config.method === "get";

    faxios.interceptors.request.use(
      (config) => {
        config.headers.test = "special get headers";
        return config;
      },
      null,
      { runWhen: onGetCall },
    );

    const responsePromise = faxios("/foo");
    const request = await waitForRequest();

    expect(request.requestHeaders.test).toBe("special get headers");
    request.respondWith();
    await responsePromise;
  });

  it("does not run the interceptor if runWhen function is provided and resolves to false", async () => {
    const onPostCall = (config: InternalFaxiosRequestConfig) =>
      config.method === "post";

    faxios.interceptors.request.use(
      (config) => {
        config.headers.test = "special get headers";
        return config;
      },
      null,
      { runWhen: onPostCall },
    );

    const responsePromise = faxios("/foo");
    const request = await waitForRequest();

    expect(request.requestHeaders.test).toBeUndefined();
    request.respondWith();
    await responsePromise;
  });

  it("does not run async interceptor if runWhen resolves to false (and runs synchronously)", async () => {
    let asyncFlag = false;
    const onPostCall = (config: InternalFaxiosRequestConfig) =>
      config.method === "post";

    faxios.interceptors.request.use(
      (config) => {
        config.headers.test = "special get headers";
        return config;
      },
      null,
      { synchronous: false, runWhen: onPostCall },
    );

    faxios.interceptors.request.use(
      (config) => {
        config.headers.sync = "hello world";
        expect(asyncFlag).toBe(false);
        return config;
      },
      null,
      { synchronous: true },
    );

    const responsePromise = faxios("/foo");
    asyncFlag = true;

    const request = await waitForRequest();
    expect(request.requestHeaders.test).toBeUndefined();
    expect(request.requestHeaders.sync).toBe("hello world");
    request.respondWith();
    await responsePromise;
  });

  it("should call request onRejected when interceptor throws", async () => {
    const rejectedSpy = vi.fn();
    const error = new Error("deadly error");

    faxios.interceptors.request.use(
      () => {
        throw error;
      },
      rejectedSpy,
      { synchronous: true },
    );

    const responsePromise = faxios("/foo").catch(() => {});
    const request = await waitForRequest();
    request.respondWith();
    await responsePromise;

    expect(rejectedSpy).toHaveBeenCalledWith(error);
  });

  it("should add a request interceptor that returns a new config object", async () => {
    faxios.interceptors.request.use(
      () =>
        ({
          url: "/bar",
          method: "post",
        }) as InternalFaxiosRequestConfig,
    );

    const responsePromise = faxios("/foo");
    const request = await waitForRequest();

    expect(request.method).toBe("POST");
    expect(request.url).toBe("/bar");
    request.respondWith();
    await responsePromise;
  });

  it("should add a request interceptor that returns a promise", async () => {
    faxios.interceptors.request.use(
      async (config) =>
        new Promise<typeof config>((resolve) => {
          setTimeout(() => {
            config.headers.async = "promise";
            resolve(config);
          }, 100);
        }),
    );

    const responsePromise = faxios("/foo");
    const request = await waitForRequest(1500);

    expect(request.requestHeaders.async).toBe("promise");
    request.respondWith();
    await responsePromise;
  });

  it("should add multiple request interceptors", async () => {
    faxios.interceptors.request.use((config) => {
      config.headers.test1 = "1";
      return config;
    });
    faxios.interceptors.request.use((config) => {
      config.headers.test2 = "2";
      return config;
    });
    faxios.interceptors.request.use((config) => {
      config.headers.test3 = "3";
      return config;
    });

    const responsePromise = faxios("/foo");
    const request = await waitForRequest();

    expect(request.requestHeaders.test1).toBe("1");
    expect(request.requestHeaders.test2).toBe("2");
    expect(request.requestHeaders.test3).toBe("3");
    request.respondWith();
    await responsePromise;
  });

  it("should add a response interceptor", async () => {
    faxios.interceptors.response.use((data) => {
      data.data = `${data.data} - modified by interceptor`;
      return data;
    });

    const responsePromise = faxios("/foo");
    const request = await waitForRequest();

    request.respondWith({
      status: 200,
      responseText: "OK",
    });

    const response = await responsePromise;
    expect(response.data).toBe("OK - modified by interceptor");
  });

  it("should add a response interceptor when request interceptor is defined", async () => {
    faxios.interceptors.request.use((data) => data);

    faxios.interceptors.response.use((data) => {
      data.data = `${data.data} - modified by interceptor`;
      return data;
    });

    const responsePromise = faxios("/foo");
    const request = await waitForRequest();

    request.respondWith({
      status: 200,
      responseText: "OK",
    });

    const response = await responsePromise;
    expect(response.data).toBe("OK - modified by interceptor");
  });

  it("should add a response interceptor that returns a new data object", async () => {
    faxios.interceptors.response.use(() => ({
      data: "stuff",
    }));

    const responsePromise = faxios("/foo");
    const request = await waitForRequest();

    request.respondWith({
      status: 200,
      responseText: "OK",
    });

    const response = await responsePromise;
    expect(response.data).toBe("stuff");
  });

  it("should add a response interceptor that returns a promise", async () => {
    faxios.interceptors.response.use(
      async (data) =>
        new Promise((resolve) => {
          setTimeout(() => {
            data.data = "you have been promised!";
            resolve(data);
          }, 10);
        }),
    );

    const responsePromise = faxios("/foo");
    const request = await waitForRequest();

    request.respondWith({
      status: 200,
      responseText: "OK",
    });

    const response = await responsePromise;
    expect(response.data).toBe("you have been promised!");
  });

  describe("given multiple response interceptors", () => {
    const fireRequest = async () => {
      const responsePromise = faxios("/foo");
      const request = await waitForRequest();

      request.respondWith({
        status: 200,
        responseText: "OK",
      });

      return responsePromise;
    };

    it("then each interceptor is executed", async () => {
      const interceptor1 = vi.fn((response) => response);
      const interceptor2 = vi.fn((response) => response);

      faxios.interceptors.response.use(interceptor1);
      faxios.interceptors.response.use(interceptor2);

      await fireRequest();

      expect(interceptor1).toHaveBeenCalled();
      expect(interceptor2).toHaveBeenCalled();
    });

    it("then they are executed in the order they were added", async () => {
      const interceptor1 = vi.fn((response) => response);
      const interceptor2 = vi.fn((response) => response);

      faxios.interceptors.response.use(interceptor1);
      faxios.interceptors.response.use(interceptor2);

      await fireRequest();

      expect(interceptor1.mock.invocationCallOrder[0]!).toBeLessThan(
        interceptor2.mock.invocationCallOrder[0]!,
      );
    });

    it("then only the last interceptor's result is returned", async () => {
      faxios.interceptors.response.use(() => "response 1");
      faxios.interceptors.response.use(() => "response 2");

      const response = await fireRequest();
      expect(response).toBe("response 2");
    });

    it("then every interceptor receives the result of its predecessor", async () => {
      faxios.interceptors.response.use(() => "response 1");
      faxios.interceptors.response.use((response) => [response, "response 2"]);

      const response = await fireRequest();
      expect(response).toEqual(["response 1", "response 2"]);
    });

    describe("and when the fulfillment interceptor throws", () => {
      const fireRequestCatch = async () => {
        const responsePromise = faxios("/foo").catch(() => {});
        const request = await waitForRequest();

        request.respondWith({
          status: 200,
          responseText: "OK",
        });

        await responsePromise;
      };

      it("then the following fulfillment interceptor is not called", async () => {
        faxios.interceptors.response.use(() => {
          throw new Error("throwing interceptor");
        });

        const interceptor2 = vi.fn((response) => response);
        faxios.interceptors.response.use(interceptor2);

        await fireRequestCatch();
        expect(interceptor2).not.toHaveBeenCalled();
      });

      it("then the following rejection interceptor is called", async () => {
        faxios.interceptors.response.use(() => {
          throw new Error("throwing interceptor");
        });

        // eslint-disable-next-line promise/no-promise-in-callback
        const rejectIntercept = vi.fn(async (error) => Promise.reject(error));
        faxios.interceptors.response.use(() => {}, rejectIntercept);

        await fireRequestCatch();
        expect(rejectIntercept).toHaveBeenCalled();
      });

      it("once caught, another following fulfillment interceptor is called again", async () => {
        faxios.interceptors.response.use(() => {
          throw new Error("throwing interceptor");
        });

        faxios.interceptors.response.use(
          () => {},
          () => "recovered",
        );

        const interceptor3 = vi.fn((response) => response);
        faxios.interceptors.response.use(interceptor3);

        await fireRequestCatch();
        expect(interceptor3).toHaveBeenCalled();
      });
    });
  });

  it("should allow removing interceptors", async () => {
    faxios.interceptors.response.use((data) => {
      data.data = `${data.data}1`;
      return data;
    });
    const intercept = faxios.interceptors.response.use((data) => {
      data.data = `${data.data}2`;
      return data;
    });
    faxios.interceptors.response.use((data) => {
      data.data = `${data.data}3`;
      return data;
    });

    faxios.interceptors.response.eject(intercept);

    const responsePromise = faxios("/foo");
    const request = await waitForRequest();

    request.respondWith({
      status: 200,
      responseText: "OK",
    });

    const response = await responsePromise;
    expect(response.data).toBe("OK13");
  });

  it("should remove async interceptor before making request and execute synchronously", async () => {
    let asyncFlag = false;

    const asyncIntercept = faxios.interceptors.request.use(
      (config) => {
        config.headers.async = "async it!";
        return config;
      },
      null,
      { synchronous: false },
    );

    faxios.interceptors.request.use(
      (config) => {
        config.headers.sync = "hello world";
        expect(asyncFlag).toBe(false);
        return config;
      },
      null,
      { synchronous: true },
    );

    faxios.interceptors.request.eject(asyncIntercept);

    const responsePromise = faxios("/foo");
    asyncFlag = true;

    const request = await waitForRequest();
    expect(request.requestHeaders.async).toBeUndefined();
    expect(request.requestHeaders.sync).toBe("hello world");
    request.respondWith();
    await responsePromise;
  });

  it("should execute interceptors before transformers", async () => {
    faxios.interceptors.request.use((config) => {
      (config.data as Record<string, unknown>).baz = "qux";
      return config;
    });

    const responsePromise = faxios.post("/foo", {
      foo: "bar",
    });

    const request = await waitForRequest();
    expect(request.params).toEqual('{"foo":"bar","baz":"qux"}');
    request.respondWith();
    await responsePromise;
  });

  it("should modify base URL in request interceptor", async () => {
    const instance = faxios.create({
      baseURL: "http://test.com/",
    });

    instance.interceptors.request.use((config) => {
      config.baseURL = "http://rebase.com/";
      return config;
    });

    const responsePromise = instance.get("/foo");
    const request = await waitForRequest();

    expect(request.url).toBe("http://rebase.com/foo");
    request.respondWith();
    await responsePromise;
  });

  it("should clear all request interceptors", () => {
    const instance = faxios.create({
      baseURL: "http://test.com/",
    });

    instance.interceptors.request.use((config) => config);
    instance.interceptors.request.clear();

    expect(instance.interceptors.request.handlers.length).toBe(0);
  });

  it("should clear all response interceptors", () => {
    const instance = faxios.create({
      baseURL: "http://test.com/",
    });

    instance.interceptors.response.use((config) => config);
    instance.interceptors.response.clear();

    expect(instance.interceptors.response.handlers.length).toBe(0);
  });
});
