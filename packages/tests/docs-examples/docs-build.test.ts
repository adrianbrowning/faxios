import { execFile } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const docsPackage = join(import.meta.dirname, "../../docs");
const vitepress = join(docsPackage, "node_modules/.bin/vitepress");
const fixture = join(import.meta.dirname, "fixtures/broken-vitepress");
// Inside the docs package's node_modules (ignored by git), so the site resolves `vue` from the
// docs dependencies the way the real site does, and the build cache and output stay out of the repo.
const scratch = join(docsPackage, "node_modules/.cache");

// `pnpm docs:build` (in `pnpm check` and PR CI) is the production VitePress build. This proves
// that build fails on a broken page, so the failure shows up before a release deploys the site.
describe("docs build", () => {
  let site: string;

  beforeEach(() => {
    mkdirSync(scratch, { recursive: true });
    site = mkdtempSync(join(scratch, "broken-vitepress-"));
    cpSync(fixture, site, { recursive: true });
  });

  afterEach(() => {
    rmSync(site, { recursive: true, force: true });
  });

  async function build(): Promise<{ code: number; output: string; }> {
    try {
      const { stdout, stderr } = await run(vitepress, [ "build", site ]);
      return { code: 0, output: stdout + stderr };
    }
    catch (error) {
      const { code, stdout, stderr } = error as { code: number; stderr: string; stdout: string; };
      return { code, output: stdout + stderr };
    }
  }

  it("fails on a page with a dead link, and builds once the link is fixed", async () => {
    const broken = await build();
    expect(broken.code).not.toBe(0);
    expect(broken.output).toContain("dead link");

    const page = join(site, "index.md");
    writeFileSync(page, readFileSync(page, "utf8").replace("](./missing-page)", "](./)"));
    const fixed = await build();
    expect(fixed.output).not.toContain("dead link");
    expect(fixed.code).toBe(0);
  }, 120_000);
});
