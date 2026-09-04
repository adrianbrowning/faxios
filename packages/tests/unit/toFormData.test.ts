import assert from "node:assert";
import FormData from "form-data";
import { afterEach, describe, it, vi } from "vitest";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import FaxiosURLSearchParams from "#src/lib/helpers/FaxiosURLSearchParams.js";
import toFormData from "#src/lib/helpers/toFormData.js";
import type { GenericFormData } from "#src/lib/types.js";

const fd = () => new FormData() as unknown as GenericFormData;
// ponytail: FaxiosURLSearchParams is a function-constructor; cast once
const URLSearchParamsCtor = FaxiosURLSearchParams as unknown as new (
  params?: unknown,
  options?: unknown,
) => { toString: () => string; };

describe("helpers::toFormData", () => {
  const createRNFormDataSpy = () => {
    const calls: Array<[string, unknown]> = [];
    return {
      calls,
      append: (key: string, value: unknown) => {
        calls.push([ key, value ]);
      },
      getParts: () => [],
    };
  };

  it("should convert a flat object to FormData", () => {
    const data = {
      foo: "bar",
      baz: 123,
    };

    const formData = toFormData(data, fd());

    assert.ok(formData instanceof FormData);
    assert.ok((formData as unknown as { _streams: Array<unknown>; })._streams.length > 0);
  });

  it("should convert a nested object to FormData", () => {
    const data = {
      foo: {
        bar: "baz",
      },
    };

    const formData = toFormData(data, fd());

    assert.ok(formData instanceof FormData);
  });

  it("should throw Error on circular reference", () => {
    const data: Record<string, unknown> = {
      foo: "bar",
    };
    data.self = data;

    try {
      toFormData(data, fd());
      assert.fail("Should have thrown an error");
    }
    catch (err) {
      assert.strictEqual((err as Error).message, "Circular reference detected in self");
    }
  });

  it("should handle arrays", () => {
    const data = {
      arr: [ 1, 2, 3 ],
    };

    const formData = toFormData(data, fd());
    assert.ok(formData instanceof FormData);
  });

  it("should append root-level React Native blob without recursion", () => {
    const formData = createRNFormDataSpy();

    const blob = {
      uri: "file://test.png",
      type: "image/png",
      name: "test.png",
    };

    toFormData({ file: blob }, formData);

    assert.strictEqual(formData.calls.length, 1);
    assert.strictEqual(formData.calls[0]![0], "file");
    assert.strictEqual(formData.calls[0]![1], blob);
  });

  it("should append nested React Native blob without recursion", () => {
    const formData = createRNFormDataSpy();

    const blob = {
      uri: "file://nested.png",
      type: "image/png",
      name: "nested.png",
    };

    toFormData({ nested: { file: blob } }, formData);

    assert.strictEqual(formData.calls.length, 1);
    assert.strictEqual(formData.calls[0]![0], "nested[file]");
    assert.strictEqual(formData.calls[0]![1], blob);
  });

  it("should append deeply nested React Native blob without recursion", () => {
    const formData = createRNFormDataSpy();

    const blob = {
      uri: "file://deep.png",
      name: "deep.png",
    };

    toFormData({ a: { b: { c: blob } } }, formData);

    assert.strictEqual(formData.calls.length, 1);
    assert.strictEqual(formData.calls[0]![0], "a[b][c]");
    assert.strictEqual(formData.calls[0]![1], blob);
  });

  // --- Depth limit tests ---

  function nest(depth: number): Record<string, unknown> {
    let o: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < depth; i++) o = { a: o };
    return o;
  }

  describe("maxDepth option", () => {
    it("should throw FaxiosError when payload exceeds default depth limit (100)", () => {
      try {
        toFormData(nest(101), fd());
        assert.fail("Should have thrown");
      }
      catch (err) {
        assert.ok(
          err instanceof FaxiosError,
          "error must be FaxiosError, not RangeError"
        );
        assert.strictEqual(err.code, "ERR_FORM_DATA_DEPTH_EXCEEDED");
        assert.ok(!(err instanceof RangeError));
      }
    });

    it("should succeed when payload is exactly at the default depth limit (100)", () => {
      const formData = toFormData(nest(100), fd());
      assert.ok(formData instanceof FormData);
    });

    it("should succeed for a shallow payload (no regression)", () => {
      const formData = toFormData(nest(5), fd());
      assert.ok(formData instanceof FormData);
    });

    it("should allow deeper payloads when maxDepth is raised", () => {
      const formData = toFormData(nest(150), fd(), { maxDepth: 200 });
      assert.ok(formData instanceof FormData);
    });

    it("should reject shallower payloads when maxDepth is lowered", () => {
      try {
        toFormData(nest(10), fd(), { maxDepth: 5 });
        assert.fail("Should have thrown");
      }
      catch (err) {
        assert.ok(err instanceof FaxiosError);
        assert.strictEqual(err.code, "ERR_FORM_DATA_DEPTH_EXCEEDED");
      }
    });

    it("should not throw for depth guard when maxDepth is Infinity (guard disabled)", () => {
      // Use 500 levels — deep enough to prove the guard is off, shallow enough not to overflow V8
      const formData = toFormData(nest(500), fd(), {
        maxDepth: Infinity,
      });
      assert.ok(formData instanceof FormData);
    });

    it("should still detect circular references when depth guard is active", () => {
      const data: Record<string, unknown> = { foo: "bar" };
      data.self = data;
      try {
        toFormData(data, fd());
        assert.fail("Should have thrown");
      }
      catch (err) {
        assert.ok(
          (err as Error).message.includes("Circular reference detected"),
          "must be circular-ref error"
        );
        assert.ok(
          !(err instanceof FaxiosError) ||
            err.code !== "ERR_FORM_DATA_DEPTH_EXCEEDED"
        );
      }
    });

    it("depth limit error is catchable as FaxiosError with correct code", () => {
      let caught;
      try {
        toFormData(nest(101), fd());
      }
      catch (err) {
        caught = err;
      }
      assert.ok(caught instanceof FaxiosError);
      assert.strictEqual(caught.code, "ERR_FORM_DATA_DEPTH_EXCEEDED");
      assert.ok(!(caught instanceof RangeError));
    });

    it("should reject deeply nested {} metatoken values before JSON.stringify overflows", () => {
      try {
        toFormData({ "evil{}": nest(10000) }, fd());
        assert.fail("Should have thrown");
      }
      catch (err) {
        assert.ok(
          err instanceof FaxiosError,
          "error must be FaxiosError, not RangeError"
        );
        assert.strictEqual(err.code, "ERR_FORM_DATA_DEPTH_EXCEEDED");
        assert.ok(!(err instanceof RangeError));
      }
    });

    it("should allow {} metatoken values at the same boundary as normal top-level properties", () => {
      const formData = toFormData({ "safe{}": nest(99) }, fd());
      assert.ok(formData instanceof FormData);
    });

    it("should reject {} metatoken values beyond the normal top-level property boundary", () => {
      try {
        toFormData({ "evil{}": nest(100) }, fd());
        assert.fail("Should have thrown");
      }
      catch (err) {
        assert.ok(err instanceof FaxiosError);
        assert.strictEqual(err.code, "ERR_FORM_DATA_DEPTH_EXCEEDED");
      }
    });
  });

  describe("maxDepth — params serialization via FaxiosURLSearchParams", () => {
    it("should throw FaxiosError for deeply nested params object (default limit)", () => {
      try {
        new URLSearchParamsCtor(nest(101));
        assert.fail("Should have thrown");
      }
      catch (err) {
        assert.ok(err instanceof FaxiosError);
        assert.strictEqual(err.code, "ERR_FORM_DATA_DEPTH_EXCEEDED");
      }
    });

    it("should build query string for deep params when maxDepth is raised", () => {
      const params = new URLSearchParamsCtor(nest(150), { maxDepth: 200 });
      const qs = params.toString();
      assert.ok(typeof qs === "string" && qs.length > 0);
    });

    it("should reject deeply nested {} metatoken params before JSON.stringify overflows", () => {
      try {
        new URLSearchParamsCtor({ "evil{}": nest(10000) });
        assert.fail("Should have thrown");
      }
      catch (err) {
        assert.ok(
          err instanceof FaxiosError,
          "error must be FaxiosError, not RangeError"
        );
        assert.strictEqual(err.code, "ERR_FORM_DATA_DEPTH_EXCEEDED");
        assert.ok(!(err instanceof RangeError));
      }
    });

    it("should reject {} metatoken params beyond the normal property boundary", () => {
      try {
        new URLSearchParamsCtor({ "evil{}": nest(100) });
        assert.fail("Should have thrown");
      }
      catch (err) {
        assert.ok(err instanceof FaxiosError);
        assert.strictEqual(err.code, "ERR_FORM_DATA_DEPTH_EXCEEDED");
      }
    });
  });

  it("should NOT recurse into React Native blob properties", () => {
    const formData = createRNFormDataSpy();

    const blob = {
      uri: "file://nope.png",
      type: "image/png",
      name: "nope.png",
    };

    toFormData({ file: blob }, formData);

    const keys = formData.calls.map(call => call[0]);

    assert.deepStrictEqual(keys, [ "file" ]);
    assert.ok(!keys.some(key => key.includes("uri")));
    assert.ok(!keys.some(key => key.includes("type")));
    assert.ok(!keys.some(key => key.includes("name")));
  });

  describe("prototype pollution hardening — options are read safely", () => {
    const ObjProto = Object.prototype as unknown as Record<string, unknown>;

    afterEach(() => {
      delete ObjProto["visitor"];
      delete ObjProto["maxDepth"];
      delete ObjProto["metaTokens"];
      delete ObjProto["dots"];
      delete ObjProto["indexes"];
    });

    it("should never invoke a visitor reachable only through Object.prototype", () => {
      const inherited = vi.fn(() => false);
      ObjProto["visitor"] = inherited;

      const formData = createRNFormDataSpy();
      toFormData({ foo: "bar" }, formData);

      assert.strictEqual(inherited.mock.calls.length, 0, "inherited visitor must not be called");
      assert.deepStrictEqual(formData.calls.map(call => call[0]), [ "foo" ]);
    });

    it("should still invoke a visitor passed explicitly in options", () => {
      const passed = vi.fn(() => false);

      toFormData({ foo: "bar" }, createRNFormDataSpy(), { visitor: passed });

      assert.strictEqual(passed.mock.calls.length, 1, "explicit visitor must be called");
    });

    it("should ignore a maxDepth reachable only through Object.prototype", () => {
      ObjProto["maxDepth"] = 0;

      const formData = createRNFormDataSpy();
      toFormData({ a: { b: 1 } }, formData);

      assert.deepStrictEqual(formData.calls.map(call => call[0]), [ "a[b]" ]);
    });

    it("should still honour a maxDepth passed explicitly in options", () => {
      try {
        toFormData({ a: { b: 1 } }, createRNFormDataSpy(), { maxDepth: 0 });
        assert.fail("Should have thrown");
      }
      catch (err) {
        assert.ok(err instanceof FaxiosError);
        assert.strictEqual(err.code, "ERR_FORM_DATA_DEPTH_EXCEEDED");
      }
    });

    it("should keep field names stable when metaTokens/dots/indexes are inherited only", () => {
      const clean = createRNFormDataSpy();
      toFormData({ "meta{}": { x: 1 }, a: { b: 1 }, list: [ 1, 2 ] }, clean);

      ObjProto["metaTokens"] = false;
      ObjProto["dots"] = true;
      ObjProto["indexes"] = true;

      const polluted = createRNFormDataSpy();
      toFormData({ "meta{}": { x: 1 }, a: { b: 1 }, list: [ 1, 2 ] }, polluted);

      assert.deepStrictEqual(
        polluted.calls.map(call => call[0]),
        clean.calls.map(call => call[0]),
      );
    });

    it("should still honour an explicit dots option while Object.prototype.dots is polluted", () => {
      ObjProto["dots"] = true;

      const formData = createRNFormDataSpy();
      toFormData({ a: { b: 1 } }, formData, { dots: true });

      assert.deepStrictEqual(formData.calls.map(call => call[0]), [ "a.b" ]);
    });

    it("should still honour an explicit metaTokens option while Object.prototype.metaTokens is polluted", () => {
      ObjProto["metaTokens"] = true;

      const formData = createRNFormDataSpy();
      toFormData({ "meta{}": { x: 1 } }, formData, { metaTokens: false });

      assert.deepStrictEqual(formData.calls.map(call => call[0]), [ "meta" ]);
    });

    it("should still honour an explicit indexes option while Object.prototype.indexes is polluted", () => {
      ObjProto["indexes"] = true;

      const formData = createRNFormDataSpy();
      toFormData({ list: [ 1, 2 ] }, formData, { indexes: true });

      assert.deepStrictEqual(formData.calls.map(call => call[0]), [ "list[0]", "list[1]" ]);
    });
  });
});
