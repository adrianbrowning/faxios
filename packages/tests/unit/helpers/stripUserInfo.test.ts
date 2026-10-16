import { describe, expect, it } from "vitest";
import { stripUserInfo, stripUserInfoInText } from "#src/index.js";

describe("stripUserInfo", () => {
  it.each([
    [ "https://user:pass@host/path?q=1", "https://host/path?q=1" ],
    [ "//user@host/path", "//host/path" ],
    [ "https:\\\\user:pass@host", "https:\\\\host" ],
    [ "https://host/a@b", "https://host/a@b" ],
    [ "/relative/path", "/relative/path" ],
  ])("%s becomes %s", (url, expected) => {
    expect(stripUserInfo(url)).toBe(expected);
  });
});

describe("stripUserInfoInText", () => {
  it("strips the user info after every scheme:// in the text", () => {
    expect(stripUserInfoInText("GET https://u:p@a.example/x failed, then http://u:p@ss@b.example/y"))
      .toBe("GET https://a.example/x failed, then http://b.example/y");
  });

  it("leaves an @ outside a URL's authority", () => {
    expect(stripUserInfoInText("mail me@example.com about https://host/a@b")).toBe("mail me@example.com about https://host/a@b");
  });
});
