import { afterEach, beforeEach, describe, expect, it } from "vitest";

import axios, { FaxiosHeaders } from "../../src/index.js";

class MockXMLHttpRequest {
  requestHeaders: Record<string, string> = {};
  readyState: number = 0;
  status: number = 0;
  statusText: string = "";
  responseText: string = "";
  response: string | null = null;
  onreadystatechange: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  upload: { addEventListener(): void } = { addEventListener() {} };
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
      } else if (this.onreadystatechange) {
        this.onreadystatechange();
      }
    });
  }

  abort() {}
}

let requests: MockXMLHttpRequest[] = [];
let OriginalXMLHttpRequest: typeof XMLHttpRequest;

const getLastRequest = () => {
  const request = requests.at(-1);

  expect(request).toBeDefined();

  return request!;
};

const finishRequest = async (request: MockXMLHttpRequest, promise: Promise<unknown>) => {
  request.respondWith({ status: 200 });
  await promise;
};

function testHeaderValue(headers: Record<string, unknown>, key: string, val?: unknown) {
  let found = false;

  for (const k in headers) {
    if (k.toLowerCase() === key.toLowerCase()) {
      found = true;
      expect(headers[k]).toBe(val);
      break;
    }
  }

  if (!found) {
    if (typeof val === "undefined") {
      expect(Object.prototype.hasOwnProperty.call(headers, key)).toBe(false);
    } else {
      throw new Error(`${key} was not found in headers`);
    }
  }
}

describe("headers (vitest browser)", () => {
  beforeEach(() => {
    requests = [];
    OriginalXMLHttpRequest = window.XMLHttpRequest;
    window.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    window.XMLHttpRequest = OriginalXMLHttpRequest;
  });

  it("should default common headers", async () => {
    const headers = axios.defaults.headers.common as Record<string, unknown>;
    const promise = axios("/foo");
    const request = getLastRequest();

    for (const key in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, key)) {
        expect(request.requestHeaders[key]).toBe(headers[key]);
      }
    }

    await finishRequest(request, promise);
  });

  it("should allow request interceptors to encode Unicode header values before XHR sends them", async () => {
    const instance = axios.create({ adapter: "xhr" });

    instance.interceptors.request.use((config) => {
      config.headers!['oprtName'] = encodeURIComponent(config.headers!['oprtName'] as string);
      return config;
    });

    const promise = instance.get("/foo", {
      headers: {
        oprtName: "请求用户",
      },
    });
    await new Promise((resolve) => setTimeout(resolve));
    const request = getLastRequest();

    expect(request.requestHeaders.oprtName).toBe(
      encodeURIComponent("请求用户"),
    );

    await finishRequest(request, promise);
  });

  it("should sanitize unencoded Unicode headers before passing them to XHR", async () => {
    const promise = axios.get("/foo", {
      adapter: "xhr",
      headers: {
        oprtName: "请求用户",
      },
    });
    const request = getLastRequest();

    expect(request.requestHeaders.oprtName).toBe("");

    await finishRequest(request, promise);
  });

  it("should respect common Content-Type header", async () => {
    const instance = axios.create();
    (instance.defaults.headers.common as Record<string, string>)["Content-Type"] = "application/custom";

    const promise = instance.patch("/foo", "");
    const request = getLastRequest();

    expect(request.requestHeaders["Content-Type"]).toBe("application/custom");

    await finishRequest(request, promise);
  });

  it("should add extra headers for post", async () => {
    const headers = FaxiosHeaders.from(axios.defaults.headers.common as Record<string, unknown>).toJSON();
    const promise = axios.post("/foo", "fizz=buzz");
    const request = getLastRequest();

    for (const key in headers) {
      expect(request.requestHeaders[key]).toBe(headers[key]);
    }

    await finishRequest(request, promise);
  });

  it("should reset headers by null or explicit undefined", async () => {
    const promise = axios
      .create({
        headers: {
          common: {
            "x-header-a": "a",
            "x-header-b": "b",
            "x-header-c": "c",
          },
        },
      })
      .post(
        "/foo",
        { fizz: "buzz" },
        {
          headers: {
            "Content-Type": null,
            "x-header-a": null,
            "x-header-b": undefined,
          },
        },
      );
    const request = getLastRequest();

    testHeaderValue(request.requestHeaders, "Content-Type", undefined);
    testHeaderValue(request.requestHeaders, "x-header-a", undefined);
    testHeaderValue(request.requestHeaders, "x-header-b", undefined);
    testHeaderValue(request.requestHeaders, "x-header-c", "c");

    await finishRequest(request, promise);
  });

  it("should use application/json when posting an object", async () => {
    const promise = axios.post("/foo/bar", {
      firstName: "foo",
      lastName: "bar",
    });
    const request = getLastRequest();

    testHeaderValue(request.requestHeaders, "Content-Type", "application/json");

    await finishRequest(request, promise);
  });

  it("should remove content-type if data is empty", async () => {
    const promise = axios.post("/foo");
    const request = getLastRequest();

    testHeaderValue(request.requestHeaders, "Content-Type", undefined);

    await finishRequest(request, promise);
  });

  it("should preserve content-type if data is false", async () => {
    const promise = axios.post("/foo", false);
    const request = getLastRequest();

    testHeaderValue(
      request.requestHeaders,
      "Content-Type",
      "application/x-www-form-urlencoded",
    );

    await finishRequest(request, promise);
  });

  it("should allow an FaxiosHeaders instance to be used as the value of the headers option", async () => {
    const instance = axios.create({
      headers: new FaxiosHeaders({
        xFoo: "foo",
        xBar: "bar",
      }),
    });

    const promise = instance.get("/foo", {
      headers: {
        XFOO: "foo2",
        xBaz: "baz",
      },
    });
    const request = getLastRequest();

    expect(request.requestHeaders.xFoo).toBe("foo2");
    expect(request.requestHeaders.xBar).toBe("bar");
    expect(request.requestHeaders.xBaz).toBe("baz");
    expect(request.requestHeaders.XFOO).toBeUndefined();

    await finishRequest(request, promise);
  });
});
