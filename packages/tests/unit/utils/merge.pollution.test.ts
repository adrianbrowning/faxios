/* eslint-disable no-prototype-builtins */
import assert from "node:assert";
import { describe, it } from "vitest";
import utils from "#src/lib/utils.js";
import { assertClean, ObjProto, restorePrototypeAfterEach } from "../../setup/pollution.js";

describe("Prototype Pollution Protection", () => {
  restorePrototypeAfterEach();

  describe("utils.merge", () => {
    it("should filter __proto__ key at top level", () => {
      const result = assertClean(utils.merge(
        {},
        JSON.parse("{\"__proto__\": {\"polluted\": \"yes\"}, \"safe\": \"value\"}")
      ));

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(result.safe, "value");
    });

    it("should filter constructor key at top level", () => {
      const result = utils.merge(
        {},
        { constructor: { polluted: "yes" }, safe: "value" }
      );

      assert.strictEqual(result.safe, "value");
      assert.strictEqual(result.hasOwnProperty("constructor"), false);
    });

    it("should filter prototype key at top level", () => {
      const result = utils.merge(
        {},
        { prototype: { polluted: "yes" }, safe: "value" }
      );

      assert.strictEqual(result.safe, "value");
      assert.strictEqual(result.hasOwnProperty("prototype"), false);
    });

    it("should filter __proto__ key in nested objects", () => {
      const result = assertClean(utils.merge(
        {},
        JSON.parse("{\"headers\": {\"__proto__\": {\"polluted\": \"nested\"}, \"Content-Type\": \"application/json\"}}")
      ));
      const headers = assertClean(result.headers);

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(headers["Content-Type"], "application/json");
    });

    it("should filter constructor key in nested objects", () => {
      const result: any = utils.merge(
        {},
        {
          headers: {
            constructor: { prototype: { polluted: "nested" } },
            "Content-Type": "application/json",
          },
        }
      );

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(result.headers["Content-Type"], "application/json");
      assert.strictEqual(result.headers.hasOwnProperty("constructor"), false);
    });

    it("should filter prototype key in nested objects", () => {
      const result: any = utils.merge(
        {},
        {
          headers: {
            prototype: { polluted: "nested" },
            "Content-Type": "application/json",
          },
        }
      );

      assert.strictEqual(result.headers["Content-Type"], "application/json");
      assert.strictEqual(result.headers.hasOwnProperty("prototype"), false);
    });

    it("should filter dangerous keys in deeply nested objects", () => {
      const result = assertClean(utils.merge(
        {},
        JSON.parse("{\"level1\": {\"level2\": {\"__proto__\": {\"polluted\": \"deep\"}, \"prototype\": {\"polluted\": \"deep\"}, \"safe\": \"value\"}}}")
      ));
      const level1 = assertClean(result.level1);
      const level2 = assertClean(level1.level2);

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(level2.safe, "value");
      assert.strictEqual(Object.hasOwn(level2, "prototype"), false);
    });

    it("should still merge regular properties correctly", () => {
      const result: any = utils.merge(
        { a: 1, b: { c: 2 } },
        { b: { d: 3 }, e: 4 }
      );

      assert.strictEqual(result.a, 1);
      assert.strictEqual(result.b.c, 2);
      assert.strictEqual(result.b.d, 3);
      assert.strictEqual(result.e, 4);
    });

    it("should handle JSON.parse payloads safely", () => {
      const malicious = JSON.parse("{\"__proto__\": {\"polluted\": \"yes\"}}");
      assertClean(utils.merge({}, malicious));

      assert.strictEqual(Object.prototype.polluted, undefined);
    });

    it("should handle nested JSON.parse payloads safely", () => {
      const malicious = JSON.parse(
        "{\"headers\": {\"constructor\": {\"prototype\": {\"polluted\": \"yes\"}}}}"
      );

      const result: any = utils.merge({}, malicious);

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(result.headers.hasOwnProperty("constructor"), false);
    });
  });

  // utils.merge previously read `result[targetKey]` directly, which walks the
  // prototype chain. A polluted Object.prototype.<key> object would surface as
  // the existing value and be merged into the result.
  describe("utils.merge prototype-chain read", () => {
    it("should not pick up polluted Object.prototype.<key> as the existing value", () => {
      ObjProto.headers = { evil: "yes" };

      const result: any = utils.merge(
        {},
        { headers: { "Content-Type": "application/json" } }
      );

      assert.strictEqual(result.headers.evil, undefined);
      assert.strictEqual(result.headers["Content-Type"], "application/json");
    });

    it("should not absorb polluted nested objects when the key is absent from inputs", () => {
      // When the source does not carry `customNested`, the merged result should
      // not surface it either, even if Object.prototype carries it.
      // eslint-disable-next-line no-extend-native -- prototype-pollution test; removed in afterEach
      Object.prototype.customNested = { evil: "yes" };

      const result = utils.merge({}, { safe: "value" });

      assert.strictEqual(result.hasOwnProperty("customNested"), false);
      assert.strictEqual(result.safe, "value");
    });
  });
});
