import assert from "node:assert";
import stream from "node:stream";
import FormData from "form-data";
import { describe, it, vi } from "vitest";
import { findKey, forEach, isBuffer, isFormData, isReactNative, isReactNativeBlob, isStream } from "#src/lib/utils.js";

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

  it("registers no message listener on import where setImmediate is absent and postMessage exists", async () => {
    // A browser without setImmediate: a `message` listener added at import would stay on the window.
    const messageListeners: Array<unknown> = [];
    vi.resetModules();
    vi.stubGlobal("setImmediate", undefined);
    vi.stubGlobal("postMessage", () => {});
    vi.stubGlobal("addEventListener", (type: string, listener: unknown) => {
      if (type === "message") messageListeners.push(listener);
    });
    try {
      // Dynamic import: the module has to evaluate after the globals above are stubbed.
      await import("#src/index.js");
    }
    finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
    assert.deepStrictEqual(messageListeners, []);
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

  describe("utils::isReactNativeBlob", () => {
    it("should return true for objects with uri property", () => {
      assert.strictEqual(
        isReactNativeBlob({ uri: "file://path/to/file" }),
        true
      );
      assert.strictEqual(
        isReactNativeBlob({ uri: "content://media/image" }),
        true
      );
    });

    it("should return true for React Native blob-like objects with optional name and type", () => {
      assert.strictEqual(
        isReactNativeBlob({
          uri: "file://path/to/file",
          name: "image.png",
          type: "image/png",
        }),
        true
      );
    });

    it("should return false for objects without uri property", () => {
      assert.strictEqual(
        isReactNativeBlob({ path: "file://path" }),
        false
      );
      assert.strictEqual(
        isReactNativeBlob({ url: "http://example.com" }),
        false
      );
      assert.strictEqual(isReactNativeBlob({}), false);
    });

    it("should return false for non-objects", () => {
      assert.strictEqual(isReactNativeBlob(null), false);
      assert.strictEqual(isReactNativeBlob(undefined), false);
      assert.strictEqual(isReactNativeBlob("string"), false);
      assert.strictEqual(isReactNativeBlob(123), false);
      assert.strictEqual(isReactNativeBlob(false), false);
    });

    it("should return true even if uri is empty string", () => {
      assert.strictEqual(isReactNativeBlob({ uri: "" }), true);
    });
  });

  describe("utils::isReactNative", () => {
    it("should return true for FormData with getParts method", () => {
      const mockReactNativeFormData = {
        append: () => {},
        getParts: () => [],
      };
      assert.strictEqual(isReactNative(mockReactNativeFormData), true);
    });

    it("should return false for standard FormData without getParts method", () => {
      const standardFormData = new FormData();
      assert.strictEqual(isReactNative(standardFormData), false);
    });

    it("should return false for objects without getParts method", () => {
      assert.strictEqual(isReactNative({ append: () => {} }), false);
      assert.strictEqual(isReactNative({}), false);
    });
  });
});
