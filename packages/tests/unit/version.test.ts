import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { VERSION } from "#src/index.js";

// VERSION is hard-coded and goes into the User-Agent header and error messages,
// so a release that bumps package.json must bump it too.
describe("VERSION", () => {
  it("should match the published package version", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../lib/package.json", import.meta.url), "utf8")
    ) as { version: string; };

    assert.strictEqual(VERSION, pkg.version);
  });
});
