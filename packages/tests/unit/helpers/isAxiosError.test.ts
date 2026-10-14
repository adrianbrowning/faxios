import { describe, expect, it, vi } from "vitest";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import isFaxiosError from "#src/lib/helpers/isFaxiosError.js";

describe("helpers::isFaxiosError", () => {
  it("should return true if the error is created by core::createError", () => {
    expect(isFaxiosError(new FaxiosError("Boom!", undefined, { foo: "bar" } as never))).toBe(
      true
    );
  });

  it("should return true if the error is enhanced by core::enhanceError", () => {
    expect(
      isFaxiosError(FaxiosError.from(new Error("Boom!"), undefined, { foo: "bar" } as never))
    ).toBe(true);
  });

  it("should return false if the error is a normal Error instance", () => {
    expect(isFaxiosError(new Error("Boom!"))).toBe(false);
  });

  it("should return false if the error is null", () => {
    expect(isFaxiosError(null)).toBe(false);
  });

  // A static import would share this module graph; a fresh one after resetModules is another
  // copy of faxios, whose FaxiosError is a different class.
  it("should return true for an error from another copy of faxios", async () => {
    vi.resetModules();
    const { default: OtherFaxiosError } = await import("#src/lib/core/FaxiosError.js");
    const other = new OtherFaxiosError("Boom!", FaxiosError.ERR_BAD_REQUEST);

    expect(other).not.toBeInstanceOf(FaxiosError);
    expect(isFaxiosError(other)).toBe(true);
  });

  it("should return false for a look-alike plain object without the brand", () => {
    const lookAlike = { name: "FaxiosError", message: "Boom!", code: FaxiosError.ERR_BAD_REQUEST, isFaxiosError: "true" };

    expect(isFaxiosError(lookAlike)).toBe(false);
  });
});
