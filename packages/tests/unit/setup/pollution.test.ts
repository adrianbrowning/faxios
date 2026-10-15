import assert from "node:assert";
import { describe, it } from "vitest";
import { restorePrototypeAfterEach } from "../../setup/pollution.js";

const ObjProto = Object.prototype as Record<PropertyKey, unknown>;
const originalToString = Object.prototype.toString;
const leakSymbol = Symbol("leak");

describe("restorePrototypeAfterEach", () => {
  restorePrototypeAfterEach();

  // eslint-disable-next-line vitest/expect-expect -- it.fails: the throw is the point; the next test asserts the restore
  it.fails("pollutes Object.prototype and then throws", () => {
    ObjProto["leaked"] = "yes";
    ObjProto[leakSymbol] = "yes";
    ObjProto["toString"] = () => "hijacked";
    throw new Error("test failed while Object.prototype was polluted");
  });

  it("restores Object.prototype after the throwing test", () => {
    assert.strictEqual(Object.hasOwn(Object.prototype, "leaked"), false);
    assert.strictEqual(Object.hasOwn(Object.prototype, leakSymbol), false);
    assert.strictEqual(Object.prototype.toString, originalToString);
  });
});
