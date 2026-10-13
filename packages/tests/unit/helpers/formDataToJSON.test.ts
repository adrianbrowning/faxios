import { describe, expect, it } from "vitest";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import formDataToJSON from "#src/lib/helpers/formDataToJSON.js";

describe("formDataToJSON", () => {
  it("should convert a FormData Object to JSON Object", () => {
    const formData = new FormData();

    formData.append("foo[bar][baz]", "123");

    expect(formDataToJSON(formData)).toEqual({
      foo: {
        bar: {
          baz: "123",
        },
      },
    });
  });

  it("should convert repeatable values as an array", () => {
    const formData = new FormData();

    formData.append("foo", "1");
    formData.append("foo", "2");

    expect(formDataToJSON(formData)).toEqual({
      foo: [ "1", "2" ],
    });
  });

  it("should keep repeatable values flat for 3+ entries", () => {
    const formData = new FormData();

    formData.append("select3", "301");
    formData.append("select3", "302");
    formData.append("select3", "303");

    expect(formDataToJSON(formData)).toEqual({
      select3: [ "301", "302", "303" ],
    });
  });

  it("should keep nested repeatable values flat for 3+ entries", () => {
    const formData = new FormData();

    formData.append("foo[bar]", "1");
    formData.append("foo[bar]", "2");
    formData.append("foo[bar]", "3");

    expect(formDataToJSON(formData)).toEqual({
      foo: {
        bar: [ "1", "2", "3" ],
      },
    });
  });

  it("should convert props with empty brackets to arrays", () => {
    const formData = new FormData();

    formData.append("foo[]", "1");
    formData.append("foo[]", "2");

    expect(formDataToJSON(formData)).toEqual({
      foo: [ "1", "2" ],
    });
  });

  it("should supported indexed arrays", () => {
    const formData = new FormData();

    formData.append("foo[0]", "1");
    formData.append("foo[1]", "2");

    expect(formDataToJSON(formData)).toEqual({
      foo: [ "1", "2" ],
    });
  });

  it("should resist prototype pollution CVE", () => {
    const formData = new FormData();

    formData.append("foo[0]", "1");
    formData.append("foo[1]", "2");
    formData.append("__proto__.x", "hack");
    formData.append("constructor.prototype.y", "value");

    // `__proto__`, `constructor` and `prototype` path segments are all skipped (utils.isDangerousKey).
    expect(formDataToJSON(formData)).toEqual({
      foo: [ "1", "2" ],
    });

    expect(({} as { x?: unknown; }).x).toEqual(undefined);
    expect(({} as { y?: unknown; }).y).toEqual(undefined);
  });

  it("should not write through to inherited objects on Object.prototype", () => {
    // eslint-disable-next-line no-extend-native -- prototype-pollution test; removed in finally
    Object.defineProperty(Object.prototype, "injected", {
      value: { hijack: true },
      configurable: true,
      writable: true,
    });

    try {
      const formData = new FormData();

      formData.append("injected.hijack", "STOLEN");

      const result = formDataToJSON(formData);

      expect((result as { injected?: unknown; }).injected).toEqual({ hijack: "STOLEN" });
      expect((Object.prototype as { injected?: { hijack: unknown; }; }).injected?.hijack).toBe(true);
    }
    finally {
      delete (Object.prototype as { injected?: unknown; }).injected;
    }
  });

  it("should throw FaxiosError when a field path exceeds the default depth limit", () => {
    const formData = new FormData();

    formData.append("foo" + "[bar]".repeat(101), "123");

    try {
      formDataToJSON(formData);
      throw new Error("Should have thrown");
    }
    catch (err) {
      expect(err).toBeInstanceOf(FaxiosError);
      expect((err as FaxiosError).code).toBe(FaxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED);
      expect(err).not.toBeInstanceOf(RangeError);
    }
  });

  it("should throw FaxiosError while tokenizing very deep field paths", () => {
    const formData = new FormData();

    formData.append("foo" + "[bar]".repeat(10000), "123");

    try {
      formDataToJSON(formData);
      throw new Error("Should have thrown");
    }
    catch (err) {
      expect(err).toBeInstanceOf(FaxiosError);
      expect((err as FaxiosError).code).toBe(FaxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED);
      expect(err).not.toBeInstanceOf(RangeError);
    }
  });

  it("should convert a field path at the default depth limit", () => {
    const formData = new FormData();

    formData.append("foo" + "[bar]".repeat(100), "123");

    let value: any = formDataToJSON(formData)!.foo;

    for (let i = 0; i < 100; i++) {
      value = value.bar;
    }

    expect(value).toBe("123");
  });

  it("should keep non-ASCII field names as their own keys", () => {
    const formData = new FormData();

    formData.append("名前", "x");
    formData.append("姓", "y");
    formData.append("user[名前]", "z");

    expect(formDataToJSON(formData)).toEqual({
      名前: "x",
      姓: "y",
      user: { 名前: "z" },
    });
  });

  it("should keep today's output for ASCII names and separators", () => {
    const formData = new FormData();

    formData.append("first-name", "Ada");
    formData.append("user[email]", "a@b");
    formData.append("a[]", "1");
    formData.append("a[]", "2");
    formData.append("b[0]", "x");
    formData.append("b[1]", "y");
    formData.append("c.d.e", "z");

    expect(formDataToJSON(formData)).toEqual({
      first: { name: "Ada" },
      user: { email: "a@b" },
      a: [ "1", "2" ],
      b: [ "x", "y" ],
      c: { d: { e: "z" } },
    });
  });
});
