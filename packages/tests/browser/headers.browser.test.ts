import { describe, expect, it } from "vitest";

import faxios, { FaxiosHeaders } from "#src/index.js";

import { installFetchMock } from "./helpers/fetchMock.js";

function testHeaderValue(headers: Headers, key: string, val?: unknown) {
  const actual = headers.get(key);

  if (typeof val === "undefined") {
    expect(actual).toBeNull();
  }
  else {
    expect(actual).toBe(val);
  }
}

describe("headers (vitest browser)", () => {
  it("should default common headers", async () => {
    using mock = installFetchMock();
    const headers = faxios.defaults.headers.common as Record<string, unknown>;

    await faxios("/foo");

    for (const key in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, key)) {
        expect(mock.lastRequest!.headers.get(key)).toBe(headers[key]);
      }
    }
  });

  it("should respect common Content-Type header", async () => {
    using mock = installFetchMock();
    const instance = faxios.create();
    (instance.defaults.headers.common as Record<string, string>)[
      "Content-Type"
    ] = "application/custom";

    await instance.patch("/foo", "");

    expect(mock.lastRequest!.headers.get("Content-Type")).toBe(
      "application/custom"
    );
  });

  it("should add extra headers for post", async () => {
    using mock = installFetchMock();
    const headers = FaxiosHeaders.from(
      faxios.defaults.headers.common as Record<string, unknown>
    ).toJSON();

    await faxios.post("/foo", "fizz=buzz");

    for (const key in headers) {
      expect(mock.lastRequest!.headers.get(key)).toBe(headers[key]);
    }
  });

  it("should reset headers by null or explicit undefined", async () => {
    using mock = installFetchMock();

    await faxios
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
        }
      );

    const headers = mock.lastRequest!.headers;
    testHeaderValue(headers, "Content-Type");
    testHeaderValue(headers, "x-header-a");
    testHeaderValue(headers, "x-header-b");
    testHeaderValue(headers, "x-header-c", "c");
  });

  it("should use application/json when posting an object", async () => {
    using mock = installFetchMock();

    await faxios.post("/foo/bar", {
      firstName: "foo",
      lastName: "bar",
    });

    testHeaderValue(mock.lastRequest!.headers, "Content-Type", "application/json");
  });

  it("should remove content-type if data is empty", async () => {
    using mock = installFetchMock();

    await faxios.post("/foo");

    testHeaderValue(mock.lastRequest!.headers, "Content-Type");
  });

  it("should preserve content-type if data is false", async () => {
    using mock = installFetchMock();

    await faxios.post("/foo", false);

    testHeaderValue(
      mock.lastRequest!.headers,
      "Content-Type",
      "application/x-www-form-urlencoded"
    );
  });

  it("should allow an FaxiosHeaders instance to be used as the value of the headers option", async () => {
    using mock = installFetchMock();
    const instance = faxios.create({
      headers: new FaxiosHeaders({
        xFoo: "foo",
        xBar: "bar",
      }),
    });

    await instance.get("/foo", {
      headers: {
        XFOO: "foo2",
        xBaz: "baz",
      },
    });

    const headers = mock.lastRequest!.headers;
    expect(headers.get("xFoo")).toBe("foo2");
    expect(headers.get("xBar")).toBe("bar");
    expect(headers.get("xBaz")).toBe("baz");
  });
});
