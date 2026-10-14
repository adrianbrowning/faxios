import assert from "node:assert";
import { describe, it } from "vitest";
import FaxiosHeaders from "#src/lib/core/FaxiosHeaders.js";
import { ObjProto, restorePrototypeAfterEach } from "../../setup/pollution.js";

describe("Prototype Pollution Protection", () => {
  restorePrototypeAfterEach();

  // Object.defineProperty calls a HasProperty check on `get`/`set` of the
  // descriptor. A polluted Object.prototype.get with a non-function value would
  // throw TypeError at every defineProperty site that uses a plain literal
  // descriptor. Each fixed site should be shielded with `__proto__: null`.
  describe("Object.defineProperty descriptor literals", () => {
    it("should construct FaxiosHeaders accessor methods when Object.prototype.get is polluted", () => {
      ObjProto.get = "attacker";

      // FaxiosHeaders.accessor uses Object.defineProperty on the prototype.
      // Triggering a fresh accessor definition exercises the descriptor literal.
      FaxiosHeaders.accessor("X-Pp-Test");

      const h = new FaxiosHeaders() as any;
      h.setXPpTest("value");
      assert.strictEqual(h.getXPpTest(), "value");
    });
  });
});
