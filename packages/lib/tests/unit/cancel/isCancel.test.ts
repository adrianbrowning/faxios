import { describe, it, expect } from "vitest";
import CanceledError from "../../../src/lib/cancel/CanceledError.js";
import isCancel from "../../../src/lib/cancel/isCancel.js";

describe("cancel::isCancel", () => {
  it("returns true when value is a CanceledError", () => {
    expect(isCancel(new CanceledError())).toBe(true);
  });

  it("returns false when value is not canceled", () => {
    expect(isCancel({ foo: "bar" })).toBe(false);
  });
});
