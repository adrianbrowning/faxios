import assert from "node:assert";
import { describe, it } from "vitest";
import Faxios from "#src/lib/core/Faxios.js";

describe("Faxios", () => {
  describe("handle un-writable error stack", () => {
    const assertUnwritableErrorStack = async (
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

      await assert.rejects(faxios.request("http://localhost/test-url", {}), { message: "test-error" });
    };

    it("should support errors with a defined but un-writable stack", async () => {
      await assertUnwritableErrorStack({ value: {}, writable: false });
    });

    it("should support errors with an undefined and un-writable stack", async () => {
      await assertUnwritableErrorStack({ value: undefined, writable: false });
    });

    it("should support errors with a custom getter/setter for the stack property", async () => {
      await assertUnwritableErrorStack({
        get: () => ({}),
        set: () => {
          throw new Error("read-only");
        },
      });
    });

    it("should support errors with a custom getter/setter for the stack property (null case)", async () => {
      await assertUnwritableErrorStack({
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
