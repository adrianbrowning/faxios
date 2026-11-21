import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const testsDir = resolve(import.meta.dirname, "../..");
const BROWSERS = [ "chromium", "firefox", "webkit" ];

// The script runs from a copy in a temp dir, so it takes its own lock and never builds this
// checkout. Its PATH holds only the tools a test links or fakes, and PLAYWRIGHT_BROWSERS_PATH an
// empty dir, so deno, bun and the browsers installed on this machine stay out of reach.
describe("run-tests.sh prerequisites", () => {
  let dir: string;
  let bin: string;
  let browsersPath: string;

  const realTool = (name: string) => {
    const found = (process.env.PATH ?? "").split(delimiter).map(d => join(d, name))
      .find(p => existsSync(p));
    if (!found) throw new Error(`${name} is not on PATH`);
    return found;
  };
  const fake = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  // Creates an empty file wherever this checkout's Playwright looks for each browser.
  const installBrowsers = (names: Array<string>) => {
    const script = `const pw = require("playwright"); for (const n of ${JSON.stringify(names)}) console.log(pw[n].executablePath());`;
    const paths = execFileSync(process.execPath, [ "-e", script ], {
      cwd: testsDir,
      env: { PLAYWRIGHT_BROWSERS_PATH: browsersPath },
      encoding: "utf8",
    }).trim()
      .split("\n");
    for (const path of paths) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, "");
    }
  };
  const run = () => {
    const started = performance.now();
    const result = spawnSync(join(bin, "bash"), [ join(dir, "run-tests.sh") ], {
      env: { PATH: bin, HOME: dir, PLAYWRIGHT_BROWSERS_PATH: browsersPath },
      encoding: "utf8",
    });
    return { ...result, elapsed: performance.now() - started };
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "faxios-run-tests-"));
    bin = join(dir, ".bin");
    browsersPath = join(dir, "browsers");
    mkdirSync(bin);
    mkdirSync(browsersPath);
    cpSync(join(testsDir, "run-tests.sh"), join(dir, "run-tests.sh"));
    symlinkSync(join(testsDir, "node_modules"), join(dir, "node_modules"));
    for (const tool of [ "bash", "dirname", "mkdir", "rm", "cat" ]) symlinkSync(realTool(tool), join(bin, tool));
    symlinkSync(process.execPath, join(bin, "node"));
    // Past the prerequisite check: the lockfile guard passes and the build stops at the first pnpm.
    fake("git", "exit 0");
    fake("pnpm", "echo \"pnpm $*\"; exit 1");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("exits non-zero within a second naming deno when deno is not on PATH", () => {
    fake("bun", "exit 0");
    installBrowsers(BROWSERS);

    const result = run();

    expect(result.status).not.toBe(0);
    expect(result.elapsed).toBeLessThan(1000);
    expect(result.stderr).toContain("deno");
    expect(result.stderr).not.toMatch(/bun|chromium|firefox|webkit/);
    expect(result.stdout).not.toContain("==> build faxios");
    expect(existsSync(join(dir, ".run-tests.lock"))).toBe(false);
  });

  it("names every missing prerequisite at once, each with how to install it", () => {
    installBrowsers([ "chromium" ]);

    const result = run();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/deno: .*https:\/\/docs\.deno\.com\//);
    expect(result.stderr).toMatch(/bun: .*https:\/\/bun\.sh\//);
    expect(result.stderr).toMatch(/firefox: .*playwright install firefox/);
    expect(result.stderr).toMatch(/webkit: .*playwright install webkit/);
    expect(result.stderr).not.toContain("chromium");
    expect(result.stdout).not.toContain("==> build faxios");
  });

  it("continues to the lock, the lockfile guard and the build when every prerequisite is present", () => {
    fake("deno", "exit 0");
    fake("bun", "exit 0");
    installBrowsers(BROWSERS);

    const result = run();

    expect(result.stderr).not.toContain("missing prerequisites");
    expect(result.stdout).toContain("==> build faxios\npnpm --dir ../lib build\n");
    expect(existsSync(join(dir, ".run-tests.lock"))).toBe(false);
  });
});
