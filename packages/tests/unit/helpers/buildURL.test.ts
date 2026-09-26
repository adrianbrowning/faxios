import { describe, it, expect, expectTypeOf, vi } from "vitest";
import faxios from "#src/index.ts";
import buildURL, { encode } from "#src/lib/helpers/buildURL.js";
import type { FaxiosRequestConfig, ParamEncoder, ParamsSerializerOptions } from "#src/lib/types.ts";

describe("helpers::buildURL", () => {
  it("should support null params", () => {
    expect(buildURL("/foo")).toEqual("/foo");
  });

  it("should support params", () => {
    expect(
      buildURL("/foo", {
        foo: "bar",
        isUndefined: undefined,
        isNull: null,
      })
    ).toEqual("/foo?foo=bar");
  });

  it("should support sending raw params to custom serializer func", () => {
    const serializer = vi.fn().mockReturnValue("foo=bar");
    const params = { foo: "bar" };
    const options = {
      serialize: serializer,
    };
    expect(
      buildURL(
        "/foo",
        {
          foo: "bar",
        },
        options
      )
    ).toEqual("/foo?foo=bar");
    expect(serializer).toHaveBeenCalledTimes(1);
    expect(serializer).toHaveBeenCalledWith(params, options);
  });

  it("should support object params", () => {
    expect(
      buildURL("/foo", {
        foo: {
          bar: "baz",
        },
      })
    ).toEqual("/foo?foo%5Bbar%5D=baz");
  });

  it("should support date params", () => {
    const date = new Date();

    expect(
      buildURL("/foo", {
        date,
      })
    ).toEqual("/foo?date=" + date.toISOString());
  });

  it("should support array params with encode", () => {
    expect(
      buildURL("/foo", {
        foo: [ "bar", "baz" ],
      })
    ).toEqual("/foo?foo%5B%5D=bar&foo%5B%5D=baz");
  });

  it("should support special char params", () => {
    expect(
      buildURL("/foo", {
        foo: ":$, ",
      })
    ).toEqual("/foo?foo=:$,+");
  });

  it("should support existing params", () => {
    expect(
      buildURL("/foo?foo=bar", {
        bar: "baz",
      })
    ).toEqual("/foo?foo=bar&bar=baz");
  });

  it("should support \"length\" parameter", () => {
    expect(
      buildURL("/foo", {
        query: "bar",
        start: 0,
        length: 5,
      })
    ).toEqual("/foo?query=bar&start=0&length=5");
  });

  it("should correct discard url hash mark", () => {
    expect(
      buildURL("/foo?foo=bar#hash", {
        query: "baz",
      })
    ).toEqual("/foo?foo=bar&query=baz");
  });

  it("should support URLSearchParams", () => {
    expect(buildURL("/foo", new URLSearchParams("bar=baz"))).toEqual(
      "/foo?bar=baz"
    );
  });

  it("should support custom serialize function", () => {
    const params = {
      x: 1,
    };

    const options = {
      serialize: (thisParams: unknown, thisOptions: unknown) => {
        expect(thisParams).toEqual(params);
        expect(thisOptions).toEqual(options);
        return "rendered";
      },
    };

    expect(buildURL("/foo", params, options)).toEqual("/foo?rendered");

    const customSerializer = (thisParams: unknown) => {
      expect(thisParams).toEqual(params);
      return "rendered";
    };

    expect(buildURL("/foo", params, customSerializer)).toEqual("/foo?rendered");
  });

  it("should ignore inherited serializer options", () => {
    let serializeInvoked = false;
    let encodeInvoked = false;

    Object.defineProperty(Object.prototype, "serialize", {
      value() {
        serializeInvoked = true;
        return "inherited=1";
      },
      configurable: true,
    });
    Object.defineProperty(Object.prototype, "encode", {
      value() {
        encodeInvoked = true;
        return "inherited";
      },
      configurable: true,
    });

    try {
      expect(buildURL("/foo", { value: "a b" }, {})).toEqual("/foo?value=a+b");
      expect(serializeInvoked).toBe(false);
      expect(encodeInvoked).toBe(false);
    }
    finally {
      delete (Object.prototype as Record<string, unknown>).serialize;
      delete (Object.prototype as Record<string, unknown>).encode;
    }
  });
});

describe("helpers::encode", () => {
  it("should be exported as a named export", () => {
    expect(typeof encode).toBe("function");
  });

  it("should leave plain ASCII unchanged", () => {
    expect(encode("foo")).toEqual("foo");
  });

  it("should preserve `:` rather than percent-encoding it", () => {
    expect(encode(":")).toEqual(":");
  });

  it("should preserve `$` rather than percent-encoding it", () => {
    expect(encode("$")).toEqual("$");
  });

  it("should preserve `,` rather than percent-encoding it", () => {
    expect(encode(",")).toEqual(",");
  });

  it("should encode space as `+` (form-style) rather than `%20`", () => {
    expect(encode(" ")).toEqual("+");
  });

  it("should still percent-encode characters outside the preserved set", () => {
    expect(encode("a/b")).toEqual("a%2Fb");
    expect(encode("a&b")).toEqual("a%26b");
    expect(encode("a=b")).toEqual("a%3Db");
  });

  it("should apply all substitutions together", () => {
    expect(encode("a:b$c,d e")).toEqual("a:b$c,d+e");
  });
});

describe("types::ParamEncoder", () => {
  it("accepts encodeURIComponent on a request config and on create defaults", () => {
    const config: FaxiosRequestConfig = { paramsSerializer: { encode: encodeURIComponent } };
    const instance = faxios.create({ paramsSerializer: { encode: encodeURIComponent } });
    expect(buildURL("/foo", { a: "b c" }, config.paramsSerializer)).toEqual("/foo?a=b%20c");
    expect(instance.getUri({ url: "/foo", params: { a: "b c" } })).toEqual("/foo?a=b%20c");
  });

  it("types the value and default encoder as string", () => {
    const delegating: ParamEncoder = (v, d) => {
      expectTypeOf(v).toEqualTypeOf<string>();
      expectTypeOf(d(v)).toEqualTypeOf<string>();
      return d(v);
    };
    expect(buildURL("/foo", { a: "b c" }, { encode: delegating })).toEqual("/foo?a=b+c");
  });

  it("rejects encoders that do not return a string", () => {
    // @ts-expect-error -- encoders must return a string
    const returnsNumber: ParamsSerializerOptions = { encode: () => 1 };
    // @ts-expect-error -- encoders must return a string
    const returnsUndefined: ParamsSerializerOptions = { encode: () => undefined };
    expectTypeOf(returnsNumber).toEqualTypeOf<ParamsSerializerOptions>();
    expectTypeOf(returnsUndefined).toEqualTypeOf<ParamsSerializerOptions>();
  });
});
