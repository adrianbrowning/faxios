import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { entries, measure } from "../../scripts/bundle-size.ts";

// Bundles the built package, as a consumer's bundler would; run-tests.sh and CI build it first.
const entry = (name: string) => entries.find(e => e.name === name)!;
const distEntry = resolve(import.meta.dirname, "../../../lib/dist/index.js");

describe("scripts/bundle-size.ts", () => {
  beforeAll(() => {
    if (!existsSync(distEntry)) throw new Error(`${distEntry} is missing: run \`pnpm run build\` before the unit tests.`);
  });

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
