import assert from "node:assert";
import stream from "node:stream";
import FormData from "form-data";
import { describe, it, vi } from "vitest";
import { findKey, forEach, isBuffer, isFormData, isStream } from "#src/lib/utils.js";

describe("utils", () => {
  it("should validate Stream", () => {
    assert.strictEqual(isStream(new stream.Readable()), true);
    assert.strictEqual(isStream({ foo: "bar" }), false);
  });

  it("should validate Buffer", () => {
    assert.strictEqual(isBuffer(Buffer.from("a")), true);
    assert.strictEqual(isBuffer(null), false);
    assert.strictEqual(isBuffer(undefined), false);
  });

  describe("utils::isFormData", () => {
    it("should detect the FormData instance provided by the `form-data` package", () => {
      [ 1, "str", {}, new RegExp("") ].forEach(thing => {
        assert.equal(isFormData(thing), false);
      });
      assert.equal(isFormData(new FormData()), true);
    });

    it("should not call toString method on built-in objects instances", () => {
      const buf = Buffer.from("123");

      buf.toString = () => assert.fail("should not be called");

      assert.equal(isFormData(buf), false);
    });

    it("should not call toString method on built-in objects instances, even if append method exists", () => {
      const buf = Buffer.from("123");

      (buf as unknown as Record<string, unknown>).append = () => {};

      buf.toString = () => assert.fail("should not be called");

      assert.equal(isFormData(buf), false);
    });

    it("should detect custom FormData instances by toStringTag signature and append method presence", () => {
      class FormData {
        append() {}

        get [Symbol.toStringTag]() {
          return "FormData";
        }
      }
      assert.equal(isFormData(new FormData()), true);
    });
  });

  describe("Buffer RangeError Fix", () => {
    it("should handle large Buffer in forEach without RangeError", () => {
      const largeBuffer = Buffer.alloc(1024 * 1024 * 200);
      let count = 0;

      forEach(largeBuffer, () => count++);

      assert.strictEqual(count, 0);
    });

    it("should handle large Buffer in findKey without RangeError", () => {
      const largeBuffer = Buffer.alloc(1024 * 1024 * 200);

      const result = findKey(largeBuffer, "test");

      assert.strictEqual(result, null);
    });
  });

  // A browser without setImmediate has postMessage; scheduling must not leave a window listener.
  // The import is dynamic on purpose: the check is what loading the module does to the globals.
  it("adds no message listener at import when setImmediate is missing", async () => {
    const listened: Array<string> = [];
    vi.stubGlobal("setImmediate", undefined);
    vi.stubGlobal("postMessage", () => {});
    vi.stubGlobal("addEventListener", (type: string) => {
      listened.push(type);
    });
    vi.resetModules();
    try {
      await import("#src/index.js");
    }
    finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
    assert.deepStrictEqual(listened.filter(type => type === "message"), []);
  });
});
