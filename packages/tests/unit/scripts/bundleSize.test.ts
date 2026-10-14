import { describe, expect, it } from "vitest";
import { entries, measure } from "../../scripts/bundle-size.ts";

// Bundles the built package (run-tests.sh builds it first), as a consumer's bundler would.
const entry = (name: string) => entries.find(e => e.name === name)!;

describe("scripts/bundle-size.ts", () => {
  it("bundles a named isCancel root import without the request pipeline", async () => {
    const result = await measure(entry("isCancel"));
    expect(result.inputs).not.toContain("dist/lib/faxios.js");
    expect(result.minified).toBeLessThan(1024);
  });

  it("bundles the retry plugin without Faxios.ts and fetch.ts", async () => {
    const result = await measure(entry("retry"));
    expect(result.inputs).toContain("dist/lib/plugins/retry.js");
    expect(result.inputs).not.toContain("dist/lib/core/Faxios.js");
    expect(result.inputs).not.toContain("dist/lib/adapters/fetch.js");
  });

  it("bundles the default import with Faxios.ts and fetch.ts", async () => {
    const result = await measure(entry("default"));
    expect(result.inputs).toContain("dist/lib/core/Faxios.js");
    expect(result.inputs).toContain("dist/lib/adapters/fetch.js");
  });
});
