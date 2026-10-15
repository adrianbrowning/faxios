import { describe, expect, it } from "vitest";

import isURLSameOrigin from "#src/lib/helpers/isURLSameOrigin.js";

const defaultPort = location.protocol === "https:" ? 443 : 80;
const otherScheme = location.protocol === "https:" ? "http:" : "https:";

describe("helpers::isURLSameOrigin (vitest browser)", () => {
  it("detects same origin", () => {
    expect(isURLSameOrigin(window.location.href)).toBe(true);
  });

  it("detects a relative URL as same origin", () => {
    expect(isURLSameOrigin("/foo")).toBe(true);
  });

  it("detects different origin", () => {
    expect(isURLSameOrigin("https://github.com/faxios/faxios")).toBe(false);
  });

  it("detects the same host on another port as cross-origin", () => {
    const port = Number(location.port || defaultPort) + 1;
    expect(isURLSameOrigin(`${location.protocol}//${location.hostname}:${port}/foo`)).toBe(false);
  });

  it("detects the same host with the other scheme as cross-origin", () => {
    expect(isURLSameOrigin(`${otherScheme}//${location.host}/foo`)).toBe(false);
  });

  it("detects a //host URL as cross-origin", () => {
    expect(isURLSameOrigin("//example.com/foo")).toBe(false);
  });
});
