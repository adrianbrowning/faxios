import assert from "node:assert";
import { describe, it } from "vitest";
import faxios, { create } from "../../src/index.ts";

describe("static api", () => {
  it("should have request method helpers", () => {
    assert.strictEqual(typeof faxios.request, "function");
    assert.strictEqual(typeof faxios.get, "function");
    assert.strictEqual(typeof faxios.head, "function");
    assert.strictEqual(typeof faxios.options, "function");
    assert.strictEqual(typeof faxios.delete, "function");
    assert.strictEqual(typeof faxios.post, "function");
    assert.strictEqual(typeof faxios.put, "function");
    assert.strictEqual(typeof faxios.patch, "function");
    assert.strictEqual(typeof faxios.query, "function");
  });

  it("should have promise method helpers", async () => {
    const promise = faxios.request({
      url: "/test",
      adapter: async config =>
        Promise.resolve({
          data: null,
          status: 200,
          statusText: "OK",
          headers: { get: () => null },
          config,
          request: {},
        }),
    });

    assert.strictEqual(typeof promise.then, "function");
    assert.strictEqual(typeof promise.catch, "function");

    await promise;
  });

  it("should have defaults", () => {
    assert.strictEqual(typeof faxios.defaults, "object");
    assert.strictEqual(typeof faxios.defaults.headers, "object");
  });

  it("should have interceptors", () => {
    assert.strictEqual(typeof faxios.interceptors.request, "object");
    assert.strictEqual(typeof faxios.interceptors.response, "object");
  });

  it("should have all/spread helpers", () => {
    assert.strictEqual(typeof faxios.all, "function");
    assert.strictEqual(typeof faxios.spread, "function");
  });

  it("should have factory method", () => {
    assert.strictEqual(typeof faxios.create, "function");
  });

  it("should expose create as a named export", () => {
    assert.strictEqual(typeof create, "function");
    assert.strictEqual(create, faxios.create);
  });

  it("should have CanceledError, CancelToken, and isCancel properties", () => {
    assert.strictEqual(typeof faxios.Cancel, "function");
    assert.strictEqual(typeof faxios.CancelToken, "function");
    assert.strictEqual(typeof faxios.isCancel, "function");
  });

  it("should have getUri method", () => {
    assert.strictEqual(typeof faxios.getUri, "function");
  });

  it("should ignore inherited data for bodyless method helpers", async () => {
    Object.defineProperty(Object.prototype, "data", {
      value: "inherited-body",
      configurable: true,
    });

    try {
      await Promise.all(
        [ "delete", "get", "head", "options" ].map(async method => {
          let seenData = "unset";

          const fn = (
            faxios as unknown as Record<
              string,
              (url: string, config: unknown) => Promise<unknown>
            >
          )[method]!;
          await fn("/test", {
            async adapter(
              config: import("../../src/lib/types.ts").InternalFaxiosRequestConfig
            ) {
              seenData = config.data as string;

              return Promise.resolve({
                data: null,
                status: 200,
                statusText: "OK",
                headers: { get: () => null },
                config,
                request: {},
              });
            },
          });

          assert.strictEqual(seenData, undefined);
        })
      );
    }
    finally {
      delete (Object.prototype as Record<string, unknown>).data;
    }
  });

  it("should ignore inherited nested serializer fields in getUri", () => {
    let serializeInvoked = false;

    Object.defineProperty(Object.prototype, "serialize", {
      value() {
        serializeInvoked = true;
        return "inherited=1";
      },
      configurable: true,
    });

    try {
      assert.strictEqual(
        faxios.getUri({
          url: "/foo",
          params: { value: "a b" },
          paramsSerializer: {},
        }),
        "/foo?value=a+b"
      );
      assert.strictEqual(serializeInvoked, false);
    }
    finally {
      delete (Object.prototype as Record<string, unknown>).serialize;
    }
  });

  it("should have isFaxiosError properties", () => {
    assert.strictEqual(typeof faxios.isFaxiosError, "function");
  });

  it("should have mergeConfig properties", () => {
    assert.strictEqual(typeof faxios.mergeConfig, "function");
  });

  it("should have getAdapter properties", () => {
    assert.strictEqual(typeof faxios.getAdapter, "function");
  });

  it("should pass symbol keys to transformRequest", async () => {
    const symbolKey = Symbol("example");
    let transformedData;

    await faxios.post(
      "/test",
      {
        [symbolKey]: "value",
        stringKey: "value",
      },
      {
        transformRequest(data: unknown) {
          transformedData = data;
          return "";
        },
        adapter: async (
          config: import("../../src/lib/types.ts").InternalFaxiosRequestConfig
        ) =>
          Promise.resolve({
            data: null,
            status: 200,
            statusText: "OK",
            headers: { get: () => null },
            config,
            request: {},
          }),
      }
    );

    assert.strictEqual(
      (transformedData as unknown as Record<symbol, unknown>)[symbolKey],
      "value"
    );
  });
});

describe("instance api", () => {
  const instance = faxios.create();

  it("should have request methods", () => {
    assert.strictEqual(typeof instance.request, "function");
    assert.strictEqual(typeof instance.get, "function");
    assert.strictEqual(typeof instance.options, "function");
    assert.strictEqual(typeof instance.head, "function");
    assert.strictEqual(typeof instance.delete, "function");
    assert.strictEqual(typeof instance.post, "function");
    assert.strictEqual(typeof instance.put, "function");
    assert.strictEqual(typeof instance.patch, "function");
    assert.strictEqual(typeof instance.query, "function");
  });

  it("should have interceptors", () => {
    assert.strictEqual(typeof instance.interceptors.request, "object");
    assert.strictEqual(typeof instance.interceptors.response, "object");
  });

  it("should pass symbol keys to transformRequest through faxios.create", async () => {
    const symbolKey = Symbol("example");
    let transformedData;

    const client = faxios.create({
      transformRequest: [
        data => {
          transformedData = data;
          return "";
        },
      ],
      adapter: async config =>
        Promise.resolve({
          data: null,
          status: 200,
          statusText: "OK",
          headers: { get: () => null },
          config,
          request: {},
        }),
    });

    await client.post("/test", {
      [symbolKey]: "value",
      stringKey: "value",
    });

    assert.strictEqual(
      (transformedData as unknown as Record<symbol | string, unknown>)[
        symbolKey
      ],
      "value"
    );
    assert.strictEqual(
      (transformedData as unknown as Record<string, unknown>).stringKey,
      "value"
    );
  });
});
