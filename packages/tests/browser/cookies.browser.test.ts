import { afterEach, beforeEach, describe, expect, it } from "vitest";

import cookies from "#src/lib/helpers/cookies.js";

const clearAllCookies = () => {
  const expiry = new Date(Date.now() - 86400000).toUTCString();

  for (const cookie of document.cookie.split(";")) {
    const name = (cookie.split("=")[0] ?? "").trim();

    if (!name) {
      continue;
    }

    // Clear both default-path and root-path cookies for the same key.
    document.cookie = `${name}=; expires=${expiry}`;
    document.cookie = `${name}=; expires=${expiry}; path=/`;
  }
};

describe("helpers::cookies (vitest browser)", () => {
  beforeEach(() => {
    clearAllCookies();
  });

  afterEach(() => {
    clearAllCookies();
  });

  it("reads cookies", () => {
    document.cookie = "foo=abc";
    document.cookie = "bar=def";

    expect(cookies.read("foo")).toBe("abc");
    expect(cookies.read("bar")).toBe("def");
  });

  it("reads cookies when the cookie separator has no following space", () => {
    const descriptor = Object.getOwnPropertyDescriptor(document, "cookie");

    Object.defineProperty(document, "cookie", {
      configurable: true,
      get() {
        return "foo=abc;bar=def";
      },
    });

    try {
      expect(cookies.read("bar")).toBe("def");
    }
    finally {
      if (descriptor) {
        Object.defineProperty(document, "cookie", descriptor);
      }
      else {
        delete (document as { cookie?: string; }).cookie;
      }
    }
  });

  it("returns null for a missing cookie", () => {
    expect(cookies.read("foo")).toBeNull();
  });

  it("decodes a percent-encoded value on read", () => {
    document.cookie = "foo=a%2Bb";

    expect(cookies.read("foo")).toBe("a+b");
  });

  it("returns a malformed percent-encoded value as written instead of throwing URIError", () => {
    document.cookie = "foo=a%E0%A4%A";

    expect(cookies.read("foo")).toBe("a%E0%A4%A");
  });

  it("matches cookie names exactly even when the name contains regex metacharacters", () => {
    // previously cookies.read built a RegExp by interpolating
    // the requested name. Metacharacters could match a different cookie or trigger
    // catastrophic backtracking. A name such as "X.Y" must not match a cookie called
    // "XAY" set by the same site.
    document.cookie = "XAY=wrong";

    expect(cookies.read("X.Y")).toBeNull();
  });

  it("does not return a partial match for a name that is a prefix of another cookie", () => {
    document.cookie = "xsrf-token-extra=wrong";

    expect(cookies.read("xsrf-token")).toBeNull();
  });
});
