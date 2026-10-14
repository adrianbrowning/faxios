import { describe, expect, it } from "vitest";
import { kindOf } from "#src/lib/utils.js";

describe("utils::kindOf", () => {
  it("should return object tag", () => {
    expect(kindOf({})).toEqual("object");
    // cached result
    expect(kindOf({})).toEqual("object");
    expect(kindOf([])).toEqual("array");
  });
});
