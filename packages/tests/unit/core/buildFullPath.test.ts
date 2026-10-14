import { describe, expect, it } from "vitest";
import buildFullPath from "#src/lib/core/buildFullPath.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";

describe("core::buildFullPath", () => {
  it("combines URLs when the requested URL is relative", () => {
    expect(buildFullPath("https://api.github.com", "/users")).toBe(
      "https://api.github.com/users"
    );
  });

  it("does not combine URLs when the requested URL is absolute", () => {
    expect(
      buildFullPath("https://api.github.com", "https://api.example.com/users")
    ).toBe("https://api.example.com/users");
  });

  it("rejects an absolute requested URL with a baseURL when allowAbsoluteUrls is false", () => {
    let error;
    try {
      buildFullPath("https://api.github.com", "https://api.example.com/users", false);
    }
    catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(FaxiosError);
    expect((error as FaxiosError).code).toBe(FaxiosError.ERR_INVALID_URL);
    expect((error as FaxiosError).message).toBe("absolute URL with baseURL; set allowAbsoluteUrls: true");
  });

  it("does not combine URLs when baseURL is missing and allowAbsoluteUrls is false", () => {
    expect(
      buildFullPath(undefined, "https://api.example.com/users", false)
    ).toBe("https://api.example.com/users");
  });

  it("does not combine URLs when baseURL is not configured", () => {
    expect(buildFullPath(undefined, "/users")).toBe("/users");
  });

  it("combines URLs when baseURL and requested URL are both relative", () => {
    expect(buildFullPath("/api", "/users")).toBe("/api/users");
  });

  it("rejects HTTP URLs missing slashes after the protocol", () => {
    for (const call of [
      () => buildFullPath(undefined, "https:example.com/users"),
      () => buildFullPath(undefined, "\thttps:example.com/users"),
      () => buildFullPath(undefined, "\u0000https:example.com/users"),
      () => buildFullPath(undefined, "h\nttp:example.com/users"),
      () => buildFullPath(undefined, "ht\ttp:example.com/users"),
      () => buildFullPath(undefined, "htt\rp:example.com/users"),
      () => buildFullPath(undefined, "http:/example.com/users"),
      () => buildFullPath("http:example.com/api", "/users"),
    ]) {
      let error;
      try {
        call();
      }
      catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(FaxiosError);
      expect((error as FaxiosError).code).toBe(FaxiosError.ERR_INVALID_URL);
      expect((error as FaxiosError).message).toBe("Invalid URL: missing \"//\" after protocol");
    }
  });

  it("does not reject an unused malformed baseURL for absolute requests", () => {
    expect(
      buildFullPath("http:example.com/api", "https://api.example.com/users")
    ).toBe("https://api.example.com/users");
  });

  it("rejects a tab or line break in the URL, or in the baseURL it joins", () => {
    const invalid = { code: FaxiosError.ERR_INVALID_URL, message: "Invalid URL: contains a tab or line break" };
    for (const call of [
      () => buildFullPath(undefined, "https:\t//evil.test/p"),
      () => buildFullPath(undefined, "https:/\n/evil.test/p"),
      () => buildFullPath(undefined, "/a\rb"),
      () => buildFullPath("https://api.example.com", "/users\t"),
      () => buildFullPath("https://api.\nexample.com", "/users"),
    ]) {
      expect(call).toThrow(expect.objectContaining(invalid));
    }
    // An unused baseURL isn't checked, as for a malformed protocol.
    expect(buildFullPath("https://api.\nexample.com", "https://other.example/x")).toBe("https://other.example/x");
  });

});
