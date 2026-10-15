import { describe, expect, it } from "vitest";
import isAbsoluteURL from "#src/lib/helpers/isAbsoluteURL.js";

describe("helpers::isAbsoluteURL", () => {
  it("should return true if URL begins with valid scheme name", () => {
    expect(isAbsoluteURL("https://api.github.com/users")).toBe(true);
    expect(isAbsoluteURL("custom-scheme-v1.0://example.com/")).toBe(true);
    expect(isAbsoluteURL("HTTP://example.com/")).toBe(true);
  });

  it("should return false if URL begins with invalid scheme name", () => {
    expect(isAbsoluteURL("123://example.com/")).toBe(false);
    expect(isAbsoluteURL("!valid://example.com/")).toBe(false);
  });

  it("should return false for protocol-relative URLs (not supported)", () => {
    expect(isAbsoluteURL("//example.com/")).toBe(false);
  });

  it("should return false if URL is relative", () => {
    expect(isAbsoluteURL("/foo")).toBe(false);
    expect(isAbsoluteURL("foo")).toBe(false);
  });

  it("returns false for a scheme without \"//\", so a relative path with a colon stays relative", () => {
    expect(isAbsoluteURL("documents:batchGet")).toBe(false);
    expect(isAbsoluteURL("localhost:3000/x")).toBe(false);
    expect(isAbsoluteURL("mailto:someone@example.com")).toBe(false);
  });
});
