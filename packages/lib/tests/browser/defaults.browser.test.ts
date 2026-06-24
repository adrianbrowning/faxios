import { afterEach, beforeEach, describe, expect, it } from "vitest";

import axios from "../../src/index.js";
import type { HeadersDefaults } from "../../src/lib/types.js";
import FaxiosHeaders from "../../../lib/src/lib/core/FaxiosHeaders.js";
import defaults from "../../../lib/src/lib/defaults/index.js";

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

const XSRF_COOKIE_NAME = "CUSTOM-XSRF-TOKEN";

const transformRequest = (defaults.transformRequest as unknown as Array<(data: unknown, headers: FaxiosHeaders) => unknown>);
const transformResponse = (defaults.transformResponse as Array<(data: unknown, headers?: FaxiosHeaders) => unknown>);

let requests: MockXMLHttpRequest[] = [];
let OriginalXMLHttpRequest: typeof XMLHttpRequest;

const getLastRequest = (): MockXMLHttpRequest => {
  const request = requests.at(-1);

  expect(request).toBeDefined();

  return request!;
};

const finishRequest = async (request: MockXMLHttpRequest, promise: Promise<unknown>) => {
  request.respondWith({ status: 200 });
  await promise;
};

describe("defaults (vitest browser)", () => {
  beforeEach(() => {
    requests = [];
    OriginalXMLHttpRequest = window.XMLHttpRequest;
    window.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    window.XMLHttpRequest = OriginalXMLHttpRequest;
    delete axios.defaults.baseURL;
    delete (axios.defaults.headers as unknown as HeadersDefaults).get["X-CUSTOM-HEADER"];
    delete (axios.defaults.headers as unknown as HeadersDefaults).post["X-CUSTOM-HEADER"];
    document.cookie = `${XSRF_COOKIE_NAME}=;expires=${new Date(Date.now() - 86400000).toUTCString()}`;
  });

  it("should transform request json", () => {
    expect(
      transformRequest[0]!({ foo: "bar" }, new FaxiosHeaders()),
    ).toBe('{"foo":"bar"}');
  });

  it("should also transform request json when 'Content-Type' is 'application/json'", () => {
    const headers = new FaxiosHeaders({
      "Content-Type": "application/json",
    });

    expect(
      transformRequest[0]!(JSON.stringify({ foo: "bar" }), headers),
    ).toBe('{"foo":"bar"}');
    expect(transformRequest[0]!([42, 43], headers)).toBe("[42,43]");
    expect(transformRequest[0]!("foo", headers)).toBe('"foo"');
    expect(transformRequest[0]!(42, headers)).toBe("42");
    expect(transformRequest[0]!(true, headers)).toBe("true");
    expect(transformRequest[0]!(false, headers)).toBe("false");
    expect(transformRequest[0]!(null, headers)).toBe("null");
  });

  it("should transform the plain data object to a FormData instance when header is 'multipart/form-data'", () => {
    const headers = new FaxiosHeaders({
      "Content-Type": "multipart/form-data",
    });

    const transformed = transformRequest[0]!({ x: 1 }, headers);

    expect(transformed).toBeInstanceOf(FormData);
  });

  it("should do nothing to request string", () => {
    expect(transformRequest[0]!("foo=bar", new FaxiosHeaders())).toBe(
      "foo=bar",
    );
  });

  it("should transform response json", () => {
    const data = transformResponse[0]!('{"foo":"bar"}') as Record<string, unknown>;

    expect(typeof data).toBe("object");
    expect(data.foo).toBe("bar");
  });

  it("should do nothing to response string", () => {
    expect(transformResponse[0]!("foo=bar")).toBe("foo=bar");
  });

  it("should use global defaults config", async () => {
    const promise = axios("/foo");
    const request = getLastRequest();

    expect(request.url).toBe("/foo");

    await finishRequest(request, promise);
  });

  it("should use modified defaults config", async () => {
    axios.defaults.baseURL = "http://example.com/";

    const promise = axios("/foo");
    const request = getLastRequest();

    expect(request.url).toBe("http://example.com/foo");

    await finishRequest(request, promise);
  });

  it("should use request config", async () => {
    const promise = axios("/foo", {
      baseURL: "http://www.example.com",
    });
    const request = getLastRequest();

    expect(request.url).toBe("http://www.example.com/foo");

    await finishRequest(request, promise);
  });

  it("should use default config for custom instance", async () => {
    const instance = axios.create({
      xsrfCookieName: XSRF_COOKIE_NAME,
      xsrfHeaderName: "X-CUSTOM-XSRF-TOKEN",
    });
    document.cookie = `${instance.defaults.xsrfCookieName}=foobarbaz`;

    const promise = instance.get("/foo");
    const request = getLastRequest();

    expect(request.requestHeaders[instance.defaults.xsrfHeaderName as string]).toBe(
      "foobarbaz",
    );

    await finishRequest(request, promise);
  });

  it("should use GET headers", async () => {
    (axios.defaults.headers as unknown as HeadersDefaults).get["X-CUSTOM-HEADER"] = "foo";

    const promise = axios.get("/foo");
    const request = getLastRequest();

    expect(request.requestHeaders["X-CUSTOM-HEADER"]).toBe("foo");

    await finishRequest(request, promise);
  });

  it("should use POST headers", async () => {
    (axios.defaults.headers as unknown as HeadersDefaults).post["X-CUSTOM-HEADER"] = "foo";

    const promise = axios.post("/foo", {});
    const request = getLastRequest();

    expect(request.requestHeaders["X-CUSTOM-HEADER"]).toBe("foo");

    await finishRequest(request, promise);
  });

  it("should use header config", async () => {
    const instance = axios.create({
      headers: {
        common: {
          "X-COMMON-HEADER": "commonHeaderValue",
        },
        get: {
          "X-GET-HEADER": "getHeaderValue",
        },
        post: {
          "X-POST-HEADER": "postHeaderValue",
        },
      },
    });

    const promise = instance.get("/foo", {
      headers: {
        "X-FOO-HEADER": "fooHeaderValue",
        "X-BAR-HEADER": "barHeaderValue",
      },
    });
    const request = getLastRequest();

    expect(request.requestHeaders).toEqual(
      FaxiosHeaders.concat(defaults.headers.common, defaults.headers.get, {
        "X-COMMON-HEADER": "commonHeaderValue",
        "X-GET-HEADER": "getHeaderValue",
        "X-FOO-HEADER": "fooHeaderValue",
        "X-BAR-HEADER": "barHeaderValue",
      }).toJSON(),
    );

    await finishRequest(request, promise);
  });

  it("should be used by custom instance if set before instance created", async () => {
    axios.defaults.baseURL = "http://example.org/";
    const instance = axios.create();

    const promise = instance.get("/foo");
    const request = getLastRequest();

    expect(request.url).toBe("http://example.org/foo");

    await finishRequest(request, promise);
  });

  it("should not be used by custom instance if set after instance created", async () => {
    const instance = axios.create();
    axios.defaults.baseURL = "http://example.org/";

    const promise = instance.get("/foo/users");
    const request = getLastRequest();

    expect(request.url).toBe("/foo/users");

    await finishRequest(request, promise);
  });

  it("should resistant to ReDoS attack", async () => {
    const instance = axios.create();
    const start = performance.now();
    const slashes = "/".repeat(100000);
    instance.defaults.baseURL = `/${slashes}bar/`;

    const promise = instance.get("/foo");
    const request = getLastRequest();
    const elapsedTimeMs = performance.now() - start;

    expect(elapsedTimeMs).toBeLessThan(20);
    expect(request.url).toBe(`/${slashes}bar/foo`);

    await finishRequest(request, promise);
  });
});
