import assert from "node:assert";
import { describe, it } from "vitest";
import FaxiosHeaders, { defineHeaderShortcuts } from "#src/lib/core/FaxiosHeaders.js";
import { ObjProto, restorePrototypeAfterEach } from "../../setup/pollution.js";

describe("Prototype Pollution Protection", () => {
  restorePrototypeAfterEach();

  // Object.defineProperty calls a HasProperty check on `get`/`set` of the
  // descriptor. A polluted Object.prototype.get with a non-function value would
  // throw TypeError at every defineProperty site that uses a plain literal
  // descriptor. Each fixed site should be shielded with `__proto__: null`.
  describe("Object.defineProperty descriptor literals", () => {
    it("should construct FaxiosHeaders shortcut methods when Object.prototype.get is polluted", () => {
      ObjProto.get = "attacker";

      // defineHeaderShortcuts uses Object.defineProperty on the prototype; a fresh header on a
      // subclass exercises the descriptor literal without touching the shared prototype.
      class Headers extends FaxiosHeaders {}
      defineHeaderShortcuts(Headers.prototype, [ "X-Pp-Test" ]);

      const h = new Headers() as unknown as Record<string, (...args: Array<unknown>) => unknown>;
      h["setXPpTest"]!("value");
      assert.strictEqual(h["getXPpTest"]!(), "value");
    });
  });
});
