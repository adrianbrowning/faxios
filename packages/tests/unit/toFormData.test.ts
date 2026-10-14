import assert from "node:assert";
import FormData from "form-data";
import { describe, it } from "vitest";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import FaxiosURLSearchParams from "#src/lib/helpers/FaxiosURLSearchParams.js";
import toFormData from "#src/lib/helpers/toFormData.js";
import type { FormDataVisitorHelpers, GenericFormData, SerializerVisitor } from "#src/lib/types.js";

const fd = () => new FormData();
// ponytail: FaxiosURLSearchParams is a function-constructor; cast once
const URLSearchParamsCtor = FaxiosURLSearchParams as unknown as new (
  params?: unknown,
  options?: unknown,
) => { toString: () => string; };

// The entries toFormData appends, read back from a spec FormData.
const entriesOf = (data: object, options?: Parameters<typeof toFormData>[2]) =>
  [ ...(toFormData(data, new globalThis.FormData(), options)).entries() ];

describe("helpers::toFormData", () => {
  it("should convert a flat object to FormData", () => {
    assert.deepStrictEqual(entriesOf({ foo: "bar", baz: 123 }), [[ "foo", "bar" ], [ "baz", "123" ]]);
  });

  it("should convert a nested object to FormData", () => {
    assert.deepStrictEqual(entriesOf({ foo: { bar: "baz" } }), [[ "foo[bar]", "baz" ]]);
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
    assert.deepStrictEqual(entriesOf({ arr: [ 1, 2, 3 ] }), [[ "arr[]", "1" ], [ "arr[]", "2" ], [ "arr[]", "3" ]]);
  });

  // --- Depth limit tests ---

  function nest(depth: number): Record<string, unknown> {
    let o: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < depth; i++) o = { a: o };
    return o;
  }
  // The one entry `nest(depth)` appends: `a[a]…[leaf]` set to "1".
  const nestedEntry = (depth: number) => [[ `a${"[a]".repeat(depth - 1)}[leaf]`, "1" ]];

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
      assert.deepStrictEqual(entriesOf(nest(100)), nestedEntry(100));
    });

    it("should succeed for a shallow payload (no regression)", () => {
      assert.deepStrictEqual(entriesOf(nest(5)), nestedEntry(5));
    });

    it("should allow deeper payloads when maxDepth is raised", () => {
      assert.deepStrictEqual(entriesOf(nest(150), { maxDepth: 200 }), nestedEntry(150));
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
      assert.deepStrictEqual(entriesOf(nest(500), { maxDepth: Infinity }), nestedEntry(500));
    });

    it.each([ NaN, -1, 1.5, -Infinity, "5", null ])("rejects maxDepth %j with ERR_BAD_OPTION_VALUE", maxDepth => {
      // Deliberately invalid at runtime; the type says number.
      assert.throws(() => toFormData(nest(2), fd(), { maxDepth: maxDepth as number }), {
        code: "ERR_BAD_OPTION_VALUE",
        message: "option maxDepth must be a non-negative integer or Infinity",
      });
    });

    it.each([ NaN, -1 ])("rejects params maxDepth %j with ERR_BAD_OPTION_VALUE", maxDepth => {
      assert.throws(() => new URLSearchParamsCtor(nest(2), { maxDepth }).toString(), {
        code: "ERR_BAD_OPTION_VALUE",
      });
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
      assert.deepStrictEqual(entriesOf({ "safe{}": nest(99) }), [[ "safe{}", JSON.stringify(nest(99)) ]]);
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
});

describe("helpers::toFormData per-call state (#172)", () => {
  const entries = (form: globalThis.FormData) => [ ...form.entries() ].map(([ k, v ]) => [ k, String(v) ]);

  it("isolates a re-entrant visitor's inner call from the outer FormData", () => {
    const inner = new globalThis.FormData();
    const outer = toFormData({ a: 1, b: 2 }, new globalThis.FormData(), {
      visitor(this: GenericFormData, value: unknown, key: number | string, path: Array<number | string> | null, helpers: FormDataVisitorHelpers) {
        if (key === "a") toFormData({ x: 9 }, inner);
        return helpers.defaultVisitor.call(this, value, key, path, helpers);
      },
    });
    assert.deepStrictEqual(entries(outer), [[ "a", "1" ], [ "b", "2" ]]);
    assert.deepStrictEqual(entries(inner), [[ "x", "9" ]]);
  });

  it("gives a visitor only the declared helpers", () => {
    let keys: Array<string> = [];
    toFormData({ a: 1 }, new globalThis.FormData(), {
      visitor(this: GenericFormData, value: unknown, key: number | string, path: Array<number | string> | null, helpers: FormDataVisitorHelpers) {
        keys = Object.keys(helpers).sort();
        return helpers.defaultVisitor.call(this, value, key, path, helpers);
      },
    });
    assert.deepStrictEqual(keys, [ "convertValue", "defaultVisitor", "isVisitable" ]);
  });

  it("dots/indexes options on one call don't change a later default call", () => {
    toFormData({ arr: [ 1 ], o: { k: 1 } }, new globalThis.FormData(), { dots: true, indexes: true });
    const form = toFormData({ arr: [ 1 ], o: { k: 1 } }, new globalThis.FormData());
    assert.deepStrictEqual(entries(form), [[ "arr[]", "1" ], [ "o[k]", "1" ]]);
  });

  it("uses the configured Blob option for binary values", () => {
    const made: Array<unknown> = [];
    class MyBlob extends globalThis.Blob {
      constructor(parts: Array<BlobPart>) {
        super(parts);
        made.push(this);
      }
    }
    const form = toFormData({ bin: new Uint8Array([ 1 ]) }, new globalThis.FormData(), { Blob: MyBlob });
    assert.strictEqual(made.length, 1);
    assert.ok(form.get("bin") instanceof globalThis.Blob);
  });

  const code = (fn: () => unknown) => {
    try {
      fn();
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      return err.code;
    }
    assert.fail("expected a throw");
  };

  it("gives each throw a FaxiosError code", () => {
    assert.strictEqual(code(() => toFormData("x", fd())), FaxiosError.ERR_BAD_REQUEST);
    // A non-function visitor is rejected at runtime; the type rules it out.
    assert.strictEqual(code(() => toFormData({}, fd(), { visitor: 1 as unknown as SerializerVisitor })), FaxiosError.ERR_BAD_OPTION_VALUE);
    const self: Record<string, unknown> = {};
    self["self"] = self;
    assert.strictEqual(code(() => toFormData(self, fd())), FaxiosError.ERR_BAD_REQUEST);
    assert.strictEqual(code(() => toFormData({ b: new globalThis.Blob([ "x" ]) }, fd())), FaxiosError.ERR_NOT_SUPPORT);
    assert.strictEqual(code(() => toFormData({ b: Buffer.from("x") }, fd())), FaxiosError.ERR_NOT_SUPPORT);
  });
});
