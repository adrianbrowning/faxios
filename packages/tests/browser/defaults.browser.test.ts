import { afterEach, describe, expect, it } from "vitest";

import faxios from "#src/index.js";
import FaxiosHeaders from "#src/lib/core/FaxiosHeaders.js";
import defaults from "#src/lib/defaults/index.js";
import type { HeadersDefaults } from "#src/lib/types.js";

import { installFetchMock } from "./helpers/fetchMock.js";

const XSRF_COOKIE_NAME = "CUSTOM-XSRF-TOKEN";

const transformRequest = defaults.transformRequest as unknown as Array<
  (data: unknown, headers: FaxiosHeaders) => unknown
>;
const transformResponse = defaults.transformResponse as Array<
  (data: unknown, headers?: FaxiosHeaders) => unknown
>;

describe("defaults (vitest browser)", () => {
  afterEach(() => {
    delete faxios.defaults.baseURL;
    delete (faxios.defaults.headers as unknown as HeadersDefaults).get[
      "X-CUSTOM-HEADER"
    ];
    delete (faxios.defaults.headers as unknown as HeadersDefaults).post[
      "X-CUSTOM-HEADER"
    ];
    document.cookie = `${XSRF_COOKIE_NAME}=;expires=${new Date(Date.now() - 86400000).toUTCString()}`;
  });

  it("should transform request json", () => {
    expect(transformRequest[0]!({ foo: "bar" }, new FaxiosHeaders())).toBe(
      "{\"foo\":\"bar\"}"
    );
  });

  it("should also transform request json when 'Content-Type' is 'application/json'", () => {
    const headers = new FaxiosHeaders({
      "Content-Type": "application/json",
    });

    expect(transformRequest[0]!(JSON.stringify({ foo: "bar" }), headers)).toBe(
      "{\"foo\":\"bar\"}"
    );
    expect(transformRequest[0]!([ 42, 43 ], headers)).toBe("[42,43]");
    expect(transformRequest[0]!("foo", headers)).toBe("\"foo\"");
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
      "foo=bar"
    );
  });

  it("should transform response json", () => {
    const data = transformResponse[0]!("{\"foo\":\"bar\"}") as Record<
      string,
      unknown
    >;

    expect(typeof data).toBe("object");
    expect(data.foo).toBe("bar");
  });

  it("should do nothing to response string", () => {
    expect(transformResponse[0]!("foo=bar")).toBe("foo=bar");
  });

  it("should use global defaults config", async () => {
    using mock = installFetchMock();

    await faxios("/foo");

    expect(new URL(mock.lastRequest!.url).pathname).toBe("/foo");
  });

  it("should use modified defaults config", async () => {
    using mock = installFetchMock();
    faxios.defaults.baseURL = "http://example.com/";

    await faxios("/foo");

    expect(mock.lastRequest!.url).toBe("http://example.com/foo");
  });

  it("should use request config", async () => {
    using mock = installFetchMock();

    await faxios("/foo", {
      baseURL: "http://www.example.com",
    });

    expect(mock.lastRequest!.url).toBe("http://www.example.com/foo");
  });

  it("should use default config for custom instance", async () => {
    using mock = installFetchMock();
    const instance = faxios.create({
      xsrfCookieName: XSRF_COOKIE_NAME,
      xsrfHeaderName: "X-CUSTOM-XSRF-TOKEN",
    });
    document.cookie = `${instance.defaults.xsrfCookieName}=foobarbaz`;

    await instance.get("/foo");

    expect(
      mock.lastRequest!.headers.get(instance.defaults.xsrfHeaderName as string)
    ).toBe("foobarbaz");
  });

  it("should use GET headers", async () => {
    using mock = installFetchMock();
    (faxios.defaults.headers as unknown as HeadersDefaults).get[
      "X-CUSTOM-HEADER"
    ] = "foo";

    await faxios.get("/foo");

    expect(mock.lastRequest!.headers.get("X-CUSTOM-HEADER")).toBe("foo");
  });

  it("should use POST headers", async () => {
    using mock = installFetchMock();
    (faxios.defaults.headers as unknown as HeadersDefaults).post[
      "X-CUSTOM-HEADER"
    ] = "foo";

    await faxios.post("/foo", {});

    expect(mock.lastRequest!.headers.get("X-CUSTOM-HEADER")).toBe("foo");
  });

  it("should use header config", async () => {
    using mock = installFetchMock();
    const instance = faxios.create({
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

    await instance.get("/foo", {
      headers: {
        "X-FOO-HEADER": "fooHeaderValue",
        "X-BAR-HEADER": "barHeaderValue",
      },
    });

    // Lib lowercases header names on a Headers object, so assert each
    // expected header individually rather than comparing whole objects.
    const headers = mock.lastRequest!.headers;
    expect(headers.get("X-COMMON-HEADER")).toBe("commonHeaderValue");
    expect(headers.get("X-GET-HEADER")).toBe("getHeaderValue");
    expect(headers.get("X-FOO-HEADER")).toBe("fooHeaderValue");
    expect(headers.get("X-BAR-HEADER")).toBe("barHeaderValue");
    expect(headers.get("X-POST-HEADER")).toBeNull();
  });

  it("should be used by custom instance if set before instance created", async () => {
    using mock = installFetchMock();
    faxios.defaults.baseURL = "http://example.org/";
    const instance = faxios.create();

    await instance.get("/foo");

    expect(mock.lastRequest!.url).toBe("http://example.org/foo");
  });

  it("should not be used by custom instance if set after instance created", async () => {
    using mock = installFetchMock();
    const instance = faxios.create();
    faxios.defaults.baseURL = "http://example.org/";

    await instance.get("/foo/users");

    expect(new URL(mock.lastRequest!.url).pathname).toBe("/foo/users");
  });

  it("should resistant to ReDoS attack", async () => {
    using mock = installFetchMock();
    const instance = faxios.create();
    const start = performance.now();
    const slashes = "/".repeat(100000);
    instance.defaults.baseURL = `/${slashes}bar/`;

    await instance.get("/foo");
    const elapsedTimeMs = performance.now() - start;

    expect(elapsedTimeMs).toBeLessThan(100); // ponytail: ReDoS would take seconds; 100ms is generous but not a false pass
    expect(mock.lastRequest!.url.endsWith("bar/foo")).toBe(true);
  });
});
