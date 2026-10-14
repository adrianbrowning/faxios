import { createRequire } from "node:module";
import faxios, { CanceledError, FaxiosError, FaxiosHeaders } from "faxios";
import pkg from "faxios/package.json" with { type: "json" };
import buildFullPath from "faxios/unsafe/core/buildFullPath.js";
import buildURL, { encode } from "faxios/unsafe/helpers/buildURL.js";
import combineURLs from "faxios/unsafe/helpers/combineURLs.js";
import isAbsoluteURL from "faxios/unsafe/helpers/isAbsoluteURL.js";
import { describe, expect, it } from "vitest";

describe("ESM importing", () => {
  it("exposes a callable default export with its error and header classes", () => {
    expect(faxios.CanceledError).toBe(CanceledError);
    expect(faxios.FaxiosError).toBe(FaxiosError);
    expect(faxios.FaxiosHeaders).toBe(FaxiosHeaders);
    expect(faxios.getUri({ url: "/a", baseURL: "http://example.com", params: { b: 1 } }))
      .toBe("http://example.com/a?b=1");
  });

  it("constructs working error and header classes", () => {
    const canceled = new CanceledError();
    expect(canceled).toBeInstanceOf(FaxiosError);
    expect(canceled.code).toBe("ERR_CANCELED");
    expect(faxios.isCancel(canceled)).toBe(true);

    const error = new FaxiosError("boom", "ERR_BAD_REQUEST");
    expect(faxios.isFaxiosError(error)).toBe(true);
    expect(error.message).toBe("boom");

    expect(new FaxiosHeaders({ "X-A": "1" }).get("x-a")).toBe("1");
  });
});

describe("published subpaths of the installed tarball", () => {
  it("faxios/package.json is the installed package manifest", () => {
    const resolved = createRequire(import.meta.url)("faxios/package.json") as typeof pkg;
    expect(pkg.name).toBe("@gcmdev/faxios");
    expect(pkg.version).toBe(faxios.VERSION);
    expect(resolved).toEqual(pkg);
  });

  it("unsafe/core/buildFullPath.js joins relative URLs and keeps absolute ones", () => {
    expect(buildFullPath("http://example.com/api", "users")).toBe("http://example.com/api/users");
    expect(buildFullPath("http://example.com/api", "https://other.example/x")).toBe("https://other.example/x");
    expect(() => buildFullPath("http://example.com", "https://other.example/x", false))
      .toThrow(expect.objectContaining({ code: "ERR_INVALID_URL" }));
  });

  it("unsafe/helpers/isAbsoluteURL.js tells absolute from relative URLs", () => {
    expect(isAbsoluteURL("https://example.com")).toBe(true);
    expect(isAbsoluteURL("/relative")).toBe(false);
  });

  it("unsafe/helpers/buildURL.js appends serialised params", () => {
    expect(buildURL("http://example.com/s", { q: "a b", page: 2 })).toBe("http://example.com/s?q=a+b&page=2");
    expect(buildURL("http://example.com/s#frag", { q: 1 })).toBe("http://example.com/s?q=1");
    expect(encode("a:b c")).toBe("a:b+c");
  });

  it("unsafe/helpers/combineURLs.js joins with exactly one slash", () => {
    expect(combineURLs("http://example.com/", "/users")).toBe("http://example.com/users");
    expect(combineURLs("http://example.com", "users")).toBe("http://example.com/users");
    expect(combineURLs("http://example.com")).toBe("http://example.com");
  });
});
