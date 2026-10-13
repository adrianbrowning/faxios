import assert from "node:assert";
import FormData from "form-data";
import { describe, it } from "vitest";
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

  it("gives a custom visitor only the declared helpers", () => {
    const seen: Array<Array<string>> = [];
    toFormData({ a: 1 }, new globalThis.FormData() as unknown as GenericFormData, {
      visitor(_value: unknown, _key: number | string, _path: Array<number | string> | null, helpers: object) {
        seen.push(Object.keys(helpers).sort());
        return false;
      },
    });
    assert.deepStrictEqual(seen, [[ "convertValue", "defaultVisitor", "isVisitable" ]]);
  });
});

describe("helpers::toFormData per-call state (#172)", () => {
  const entries = (form: globalThis.FormData) => [ ...form.entries() ].map(([ k, v ]) => [ k, String(v) ]);

  it("isolates a re-entrant visitor's inner call from the outer FormData", () => {
    const inner = new globalThis.FormData();
    const outer = toFormData({ a: 1, b: 2 }, new globalThis.FormData() as unknown as GenericFormData, {
      visitor(this: GenericFormData, value: unknown, key: number | string, path: Array<number | string> | null, helpers: { defaultVisitor: (...args: Array<unknown>) => boolean; }) {
        if (key === "a") toFormData({ x: 9 }, inner as unknown as GenericFormData);
        return helpers.defaultVisitor.call(this, value, key, path, helpers);
      },
    }) as unknown as globalThis.FormData;
    assert.deepStrictEqual(entries(outer), [[ "a", "1" ], [ "b", "2" ]]);
    assert.deepStrictEqual(entries(inner), [[ "x", "9" ]]);
  });

  it("dots/indexes options on one call don't change a later default call", () => {
    toFormData({ arr: [ 1 ], o: { k: 1 } }, new globalThis.FormData() as unknown as GenericFormData, { dots: true, indexes: true });
    const form = toFormData({ arr: [ 1 ], o: { k: 1 } }, new globalThis.FormData() as unknown as GenericFormData) as unknown as globalThis.FormData;
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
    const form = toFormData({ bin: new Uint8Array([ 1 ]) }, new globalThis.FormData() as unknown as GenericFormData, { Blob: MyBlob }) as unknown as globalThis.FormData;
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
    assert.strictEqual(code(() => toFormData({}, fd(), { visitor: 1 })), FaxiosError.ERR_BAD_OPTION_VALUE);
    const self: Record<string, unknown> = {};
    self["self"] = self;
    assert.strictEqual(code(() => toFormData(self, fd())), FaxiosError.ERR_BAD_REQUEST);
    assert.strictEqual(code(() => toFormData({ b: new globalThis.Blob([ "x" ]) }, fd())), FaxiosError.ERR_NOT_SUPPORT);
    assert.strictEqual(code(() => toFormData({ b: Buffer.from("x") }, fd())), FaxiosError.ERR_NOT_SUPPORT);
  });
});
