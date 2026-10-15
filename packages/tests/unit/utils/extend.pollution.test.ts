import assert from "node:assert";
import { describe, it } from "vitest";
import utils from "#src/lib/utils.js";
import { ObjProto, restorePrototypeAfterEach } from "../../setup/pollution.js";

describe("Prototype Pollution Protection", () => {
  restorePrototypeAfterEach();

  // Object.defineProperty calls a HasProperty check on `get`/`set` of the
  // descriptor. A polluted Object.prototype.get with a non-function value would
  // throw TypeError at every defineProperty site that uses a plain literal
  // descriptor. Each fixed site should be shielded with `__proto__: null`.
  describe("Object.defineProperty descriptor literals", () => {
    it("should not throw in utils.extend when Object.prototype.get is polluted", () => {
      ObjProto.get = "attacker";

      const a: Record<string, unknown> = {};
      const b = { x: 1, fn() {} };
      utils.extend(a, b, undefined);

      assert.strictEqual(a.x, 1);
      assert.strictEqual(typeof a.fn, "function");
    });

    it("should not throw in utils.extend with thisArg when Object.prototype.get is polluted", () => {
      ObjProto.get = "attacker";

      const a: Record<string, unknown> = {};
      const ctx = { tag: "ctx" };
      const b = {
        method(this: { tag: string; }) {
          return this.tag;
        },
      };
      utils.extend(a, b, ctx);

      assert.strictEqual((a.method as () => string)(), "ctx");
    });
  });
});
