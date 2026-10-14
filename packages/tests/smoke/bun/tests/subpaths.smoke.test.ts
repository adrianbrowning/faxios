import { describe, expect, test } from "bun:test";
import { VERSION } from "faxios";
import pkg from "faxios/package.json" with { type: "json" };
import buildFullPath from "faxios/unsafe/core/buildFullPath.js";
import buildURL from "faxios/unsafe/helpers/buildURL.js";
import combineURLs from "faxios/unsafe/helpers/combineURLs.js";
import isAbsoluteURL from "faxios/unsafe/helpers/isAbsoluteURL.js";

// Every published `unsafe/*` subpath and `faxios/package.json`, resolved through the installed
// tarball's `exports` map. smoke/bun/tsconfig.json type-checks the same imports against the
// shipped declarations, so these fail `lint:ts:smoke` when a subpath loses its `.d.ts`.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const typeIs = <T extends true>(): T | undefined => undefined;
typeIs<Equal<typeof buildFullPath, (baseURL: unknown, requestedURL: unknown, allowAbsoluteUrls?: unknown, config?: unknown) => string>>();
typeIs<Equal<typeof buildURL, (url: string, params?: unknown, options?: unknown) => string>>();
typeIs<Equal<typeof combineURLs, (baseURL: string, relativeURL?: string) => string>>();
typeIs<Equal<typeof isAbsoluteURL, (url: unknown) => boolean>>();
typeIs<Equal<typeof pkg.name, string>>();

describe("published subpaths", () => {
  test("faxios/unsafe/core/buildFullPath.js joins a relative URL onto the base", () => {
    expect(buildFullPath("https://api.example.com/v1/", "users")).toBe("https://api.example.com/v1/users");
    expect(buildFullPath("https://api.example.com", "https://other.example/x")).toBe("https://other.example/x");
  });

  test("faxios/unsafe/helpers/buildURL.js serializes params onto the URL", () => {
    expect(buildURL("/items", { q: "a b", page: 2 })).toBe("/items?q=a+b&page=2");
  });

  test("faxios/unsafe/helpers/combineURLs.js joins with a single slash", () => {
    expect(combineURLs("https://api.example.com/", "/users")).toBe("https://api.example.com/users");
  });

  test("faxios/unsafe/helpers/isAbsoluteURL.js tells absolute from relative URLs", () => {
    expect(isAbsoluteURL("https://api.example.com")).toBe(true);
    expect(isAbsoluteURL("/users")).toBe(false);
  });

  test("faxios/package.json is the published manifest", () => {
    expect(pkg.name).toBe("@gcmdev/faxios");
    expect(pkg.version).toBe(VERSION);
  });
});
