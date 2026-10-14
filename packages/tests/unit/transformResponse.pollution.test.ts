import assert from "node:assert";
import { describe, it } from "vitest";
import defaults from "#src/lib/defaults/index.js";
import { ObjProto, restorePrototypeAfterEach } from "../setup/pollution.js";

describe("Prototype Pollution Protection", () => {
  restorePrototypeAfterEach();

  // parseReviver read via prototype chain.
  describe("defaults.transformResponse parseReviver", () => {
    it("should ignore Object.prototype.parseReviver when parsing JSON", () => {
      let reviverCalled = false;
      ObjProto.parseReviver = function polluted(k: unknown, v: unknown) {
        reviverCalled = true;
        if (k === "role") return "admin";
        return v;
      };

      const ctx = { transitional: defaults.transitional };

      const transformFn = (defaults.transformResponse as Array<any>)[0];

      const result: any = transformFn.call(
        ctx,
        "{\"role\":\"user\",\"balance\":100}"
      );

      assert.strictEqual(reviverCalled, false);
      assert.strictEqual(result.role, "user");
      assert.strictEqual(result.balance, 100);
    });

    it("should ignore Object.prototype.responseType", () => {
      ObjProto.responseType = "json";
      const ctx = { transitional: defaults.transitional };
      // Non-JSON string body must be returned as-is; polluted responseType must
      // not force strict JSON parsing.

      const result = (defaults.transformResponse as Array<any>)[0].call(
        ctx,
        "plain text"
      );
      assert.strictEqual(result, "plain text");
    });
  });
});
