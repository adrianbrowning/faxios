import assert from "node:assert";
import { describe, it } from "vitest";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { ObjProto, restorePrototypeAfterEach } from "../../setup/pollution.js";

describe("Prototype Pollution Protection", () => {
  restorePrototypeAfterEach();

  // Object.defineProperty calls a HasProperty check on `get`/`set` of the
  // descriptor. A polluted Object.prototype.get with a non-function value would
  // throw TypeError at every defineProperty site that uses a plain literal
  // descriptor. Each fixed site should be shielded with `__proto__: null`.
  describe("Object.defineProperty descriptor literals", () => {
    it("should construct FaxiosError when Object.prototype.get is polluted", () => {
      ObjProto.get = "attacker";

      const err = new FaxiosError("hello", "ECODE");

      assert.strictEqual(err.message, "hello");
      assert.strictEqual(err.code, "ECODE");
    });

    it("should also be shielded against a polluted Object.prototype.set", () => {
      ObjProto.set = "attacker";

      // Same surface as `get` — ToPropertyDescriptor checks both. One spot-check
      // covers them all since they share the same fix.
      const err = new FaxiosError("hello");
      assert.strictEqual(err.message, "hello");
    });
  });
});
