import { describe, it, expect } from "vitest";
import combineURLs from "#src/lib/helpers/combineURLs.js";

describe("helpers::combineURLs", () => {
  it("should combine URLs", () => {
    expect(combineURLs("https://api.github.com", "/users")).toBe(
      "https://api.github.com/users"
    );
  });

  it("should remove duplicate slashes", () => {
    expect(combineURLs("https://api.github.com/", "/users")).toBe(
      "https://api.github.com/users"
    );
  });

  it("should insert missing slash", () => {
    expect(combineURLs("https://api.github.com", "users")).toBe(
      "https://api.github.com/users"
    );
  });

  it("should not insert slash when relative url missing/empty", () => {
    expect(combineURLs("https://api.github.com/users", "")).toBe(
      "https://api.github.com/users"
    );
  });

  it("should treat a single slash as an empty relative path", () => {
    expect(combineURLs("https://api.github.com/users", "/")).toBe(
      "https://api.github.com/users/"
    );
  });

  it("should not be susceptible to ReDoS on 100k-slash baseURL", () => {
    const slashes = "/".repeat(100000);
    const start = performance.now();
    const result = combineURLs(`/${slashes}bar/`, "/foo");
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(20);
    expect(result.endsWith("bar/foo")).toBe(true);
  });
});
