import { describe, expect, it } from "vitest";
import { toArray } from "#src/lib/utils.js";

describe("utils::toArray", () => {
  it("should return null or an array copy depending on input", () => {
    expect(toArray()).toEqual(null);
    expect(toArray([])).toEqual([]);
    expect(toArray([ 1 ])).toEqual([ 1 ]);
    expect(toArray([ 1, 2, 3 ])).toEqual([ 1, 2, 3 ]);
  });
});
