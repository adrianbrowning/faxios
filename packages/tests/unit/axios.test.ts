import assert from "node:assert";
import { describe, it } from "vitest";
import Faxios from "#src/lib/core/Faxios.js";

describe("Faxios", () => {
  describe("handle un-writable error stack", () => {
    const testUnwritableErrorStack = async (
      stackAttributes: PropertyDescriptor
    ) => {
      const mockError = new Error("test-error");
      Object.defineProperty(mockError, "stack", stackAttributes);

      // A request transformer's error reaches the caller as thrown, so the request rejects with
      // this exact error and its stack is patched on the way out.
      const faxios = new Faxios({
        transformRequest: [ () => {
          throw mockError;
        } ],
      });

      try {
        await faxios.request("http://localhost/test-url", {});
      }
      catch (e) {
        assert.strictEqual((e as Error).message, "test-error");
      }
    };

    it("should support errors with a defined but un-writable stack", async () => {
      await testUnwritableErrorStack({ value: {}, writable: false });
    });

    it("should support errors with an undefined and un-writable stack", async () => {
      await testUnwritableErrorStack({ value: undefined, writable: false });
    });

    it("should support errors with a custom getter/setter for the stack property", async () => {
      await testUnwritableErrorStack({
        get: () => ({}),
        set: () => {
          throw new Error("read-only");
        },
      });
    });

    it("should support errors with a custom getter/setter for the stack property (null case)", async () => {
      await testUnwritableErrorStack({
        get: () => null,
        set: () => {
          throw new Error("read-only");
        },
      });
    });
  });

  it("should not throw if the config argument is omitted", () => {
    const faxios = new Faxios();

    assert.deepStrictEqual(faxios.defaults, {});
  });
});
