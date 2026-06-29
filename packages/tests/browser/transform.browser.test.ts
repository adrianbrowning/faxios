import { describe, expect, it } from "vitest";

import faxios from "#src/index.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";

import { installFetchMock } from "./helpers/fetchMock.js";

describe("transform (vitest browser)", () => {
  it("should transform JSON to string", async () => {
    using mock = installFetchMock();

    await faxios.post("/foo", { foo: "bar" });

    expect(await mock.lastRequest!.clone().text()).toBe("{\"foo\":\"bar\"}");
  });

  it("should transform string to JSON", async () => {
    using mock = installFetchMock();
    mock.respondWith({ body: "{\"foo\": \"bar\"}" });

    const response = await faxios("/foo");

    expect(typeof response.data).toBe("object");
    expect((response.data as Record<string, string>).foo).toBe("bar");
  });

  it("should throw a SyntaxError if JSON parsing failed and responseType is \"json\" if silentJSONParsing is false", async () => {
    using mock = installFetchMock();
    mock.respondWith({ body: "{foo\": \"bar\"}" });

    const thrown = await faxios({
      url: "/foo",
      responseType: "json",
      transitional: { silentJSONParsing: false },
    }).catch(error => error);

    expect(thrown).toBeTruthy();
    expect(thrown.name).toContain("SyntaxError");
    expect(thrown.code).toBe(FaxiosError.ERR_BAD_RESPONSE);
  });

  it("should send data as JSON if request content-type is application/json", async () => {
    using mock = installFetchMock();
    mock.respondWith({ body: "" });

    const response = await faxios.post("/foo", 123, {
      headers: { "Content-Type": "application/json" },
    });

    expect(response).toBeTruthy();
    expect(mock.lastRequest!.headers.get("Content-Type")).toBe(
      "application/json"
    );
    expect(JSON.parse(await mock.lastRequest!.clone().text())).toBe(123);
  });

  it("should not assume JSON if responseType is not `json`", async () => {
    using mock = installFetchMock();
    const rawData = "{\"x\":1}";
    mock.respondWith({ body: rawData });

    const response = await faxios.get("/foo", {
      responseType: "text",
      transitional: {
        forcedJSONParsing: false,
      },
    });

    expect(response).toBeTruthy();
    expect(response.data).toBe(rawData);
  });

  it("should override default transform", async () => {
    using mock = installFetchMock();

    await faxios.post(
      "/foo",
      { foo: "bar" },
      {
        transformRequest(data) {
          return data;
        },
      }
    );

    // With the default transform bypassed, the plain object is handed to the
    // Request unchanged and coerced to its string form by the body init.
    expect(await mock.lastRequest!.clone().text()).toBe("[object Object]");
  });

  it("should allow an Array of transformers", async () => {
    using mock = installFetchMock();

    await faxios.post(
      "/foo",
      { foo: "bar" },
      {
        transformRequest: (
          faxios.defaults.transformRequest as Array<(data: unknown) => unknown>
        ).concat(function (data: unknown) {
          return (data as string).replace("bar", "baz");
        }),
      }
    );

    expect(await mock.lastRequest!.clone().text()).toBe("{\"foo\":\"baz\"}");
  });

  it("should allowing mutating headers", async () => {
    using mock = installFetchMock();
    const token = Math.floor(Math.random() * Math.pow(2, 64)).toString(36);

    await faxios("/foo", {
      transformRequest(data, headers) {
        headers["X-Authorization"] = token;
        return data;
      },
    });

    expect(mock.lastRequest!.headers.get("X-Authorization")).toBe(token);
  });

  it("should normalize 'content-type' header when using a custom transformRequest", async () => {
    using mock = installFetchMock();

    await faxios.post(
      "/foo",
      { foo: "bar" },
      {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        transformRequest: [
          function () {
            return "aa=44";
          },
        ],
      }
    );

    expect(mock.lastRequest!.headers.get("Content-Type")).toBe(
      "application/x-www-form-urlencoded"
    );
  });

  it("should return response.data as parsed JSON object when responseType is json", async () => {
    using mock = installFetchMock();
    mock.respondWith({
      body: "{\"key1\": \"value1\"}",
      headers: { "content-type": "application/json" },
    });

    const instance = faxios.create({
      baseURL: "/api",
      responseType: "json",
    });

    const response = await instance.get("my/endpoint", {
      responseType: "json",
    });

    expect(response).toBeTruthy();
    expect(response.data).toEqual({ key1: "value1" });
  });
});
