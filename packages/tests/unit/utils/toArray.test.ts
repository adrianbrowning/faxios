import { describe, expect, it } from "vitest";
import { toArray } from "#src/lib/utils.js";

describe("utils::toArray", () => {
  it("returns null for a missing value or one without a numeric length", () => {
    expect(toArray()).toBeNull();
    expect(toArray({})).toBeNull();
    expect(toArray({ length: "1", 0: "a" })).toBeNull();
  });

  it("returns an array as is, without copying it", () => {
    const array = [ 1, 2, 3 ];
    expect(toArray(array)).toBe(array);
  });

  it("returns a new array of the items of an array-like value", () => {
    const fileA = new File([ "a" ], "a.txt");
    const fileB = new File([ "b" ], "b.txt");
    const fileListLike = { 0: fileA, 1: fileB, length: 2, item: (i: number) => [ fileA, fileB ][i] ?? null };

    const result = toArray(fileListLike);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result![0]).toBe(fileA);
    expect(result![1]).toBe(fileB);
  });
});
