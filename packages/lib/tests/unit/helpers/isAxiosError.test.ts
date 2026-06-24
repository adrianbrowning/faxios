import { describe, it, expect } from "vitest";
import FaxiosError from "../../../src/lib/core/FaxiosError.js";
import isFaxiosError from "../../../src/lib/helpers/isFaxiosError.js";

describe("helpers::isFaxiosError", () => {
  it("should return true if the error is created by core::createError", () => {
    expect(isFaxiosError(new FaxiosError("Boom!", undefined, { foo: "bar" } as never))).toBe(
      true,
    );
  });

  it("should return true if the error is enhanced by core::enhanceError", () => {
    expect(
      isFaxiosError(FaxiosError.from(new Error("Boom!"), undefined, { foo: "bar" } as never)),
    ).toBe(true);
  });

  it("should return false if the error is a normal Error instance", () => {
    expect(isFaxiosError(new Error("Boom!"))).toBe(false);
  });

  it("should return false if the error is null", () => {
    expect(isFaxiosError(null)).toBe(false);
  });
});
