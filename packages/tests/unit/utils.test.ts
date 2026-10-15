import assert from "node:assert";
import stream from "node:stream";
import FormData from "form-data";
import { describe, it } from "vitest";
import utils from "#src/lib/utils.js";

describe("utils", () => {
  it("should validate Stream", () => {
    assert.strictEqual(utils.isStream(new stream.Readable()), true);
    assert.strictEqual(utils.isStream({ foo: "bar" }), false);
  });

  it("should validate Buffer", () => {
    assert.strictEqual(utils.isBuffer(Buffer.from("a")), true);
    assert.strictEqual(utils.isBuffer(null), false);
    assert.strictEqual(utils.isBuffer(undefined), false);
  });

  describe("utils::isFormData", () => {
    it("should detect the FormData instance provided by the `form-data` package", () => {
      [ 1, "str", {}, new RegExp("") ].forEach(thing => {
        assert.equal(utils.isFormData(thing), false);
      });
      assert.equal(utils.isFormData(new FormData()), true);
    });

    it("should not call toString method on built-in objects instances", () => {
      const buf = Buffer.from("123");

      buf.toString = () => assert.fail("should not be called");

      assert.equal(utils.isFormData(buf), false);
    });

    it("should not call toString method on built-in objects instances, even if append method exists", () => {
      const buf = Buffer.from("123");

      (buf as unknown as Record<string, unknown>).append = () => {};

      buf.toString = () => assert.fail("should not be called");

      assert.equal(utils.isFormData(buf), false);
    });

    it("should detect custom FormData instances by toStringTag signature and append method presence", () => {
      class FormData {
        append() {}

        get [Symbol.toStringTag]() {
          return "FormData";
        }
      }
      assert.equal(utils.isFormData(new FormData()), true);
    });
  });

  describe("Buffer RangeError Fix", () => {
    it("should handle large Buffer in isEmptyObject without RangeError", () => {
      const largeBuffer = Buffer.alloc(1024 * 1024 * 200);

      const result = utils.isEmptyObject(largeBuffer);

      assert.strictEqual(result, false);
    });

    it("should handle large Buffer in forEach without RangeError", () => {
      const largeBuffer = Buffer.alloc(1024 * 1024 * 200);
      let count = 0;

      utils.forEach(largeBuffer, () => count++);

      assert.strictEqual(count, 0);
    });

    it("should handle large Buffer in findKey without RangeError", () => {
      const largeBuffer = Buffer.alloc(1024 * 1024 * 200);

      const result = utils.findKey(largeBuffer, "test");

      assert.strictEqual(result, null);
    });
  });
});
