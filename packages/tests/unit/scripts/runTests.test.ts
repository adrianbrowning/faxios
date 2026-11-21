import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const testsDir = resolve(import.meta.dirname, "../..");
// What the browser-headless project launches: headless Chromium runs chromium-headless-shell.
const HEADLESS_EXECUTABLES = [ "chromium-headless-shell", "firefox", "webkit" ];

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
  // Lays out what `playwright install` leaves for each executable in this checkout's Playwright
  // registry, by its registry name ("chromium" is the headed build, "chromium-headless-shell" the
  // headless one): an empty file at the executable path and the browser directory's
  // INSTALLATION_COMPLETE marker.
  const installBrowsers = (names: Array<string>, hostPlatform?: string) => {
    const script = `const core = require.resolve("playwright-core/lib/coreBundle", { paths: [ require.resolve("playwright") ] });
const { registry } = require(core).registry;
const installs = ${JSON.stringify(names)}.map(n => registry.findExecutable(n));
console.log(JSON.stringify(installs.map(e => ({ directory: e.directory, executable: e.executablePath() }))));`;
    const installs = JSON.parse(execFileSync(process.execPath, [ "-e", script ], {
      cwd: testsDir,
      env: { PLAYWRIGHT_BROWSERS_PATH: browsersPath, ...hostPlatform && { PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: hostPlatform } },
      encoding: "utf8",
    })) as Array<{ directory: string; executable: string; }>;
    for (const { directory, executable } of installs) {
      mkdirSync(dirname(executable), { recursive: true });
      writeFileSync(executable, "");
      writeFileSync(join(directory, "INSTALLATION_COMPLETE"), "");
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
    installBrowsers(HEADLESS_EXECUTABLES);

    const result = run();

    expect(result.status).not.toBe(0);
    expect(result.elapsed).toBeLessThan(1000);
    expect(result.stderr).toContain("deno");
    expect(result.stderr).not.toMatch(/bun|chromium|firefox|webkit/);
    expect(result.stdout).not.toContain("==> build faxios");
    expect(existsSync(join(dir, ".run-tests.lock"))).toBe(false);
  });

  it("checks prerequisites before the lock and the lockfile guard, leaving another run's lock alone", () => {
    fake("bun", "exit 0");
    installBrowsers(HEADLESS_EXECUTABLES);
    // A live run holds the lock, and the harness lockfiles differ from HEAD.
    const lock = join(dir, ".run-tests.lock");
    mkdirSync(lock);
    writeFileSync(join(lock, "pid"), `${process.pid}\n`);
    fake("git", "exit 1");

    const result = run();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/missing prerequisites:\n {2}deno: /);
    expect(result.stderr).not.toMatch(/another run|lockfiles differ/);
    expect(readFileSync(join(lock, "pid"), "utf8")).toBe(`${process.pid}\n`);
  });

  it("names every missing prerequisite at once, each with how to install it", () => {
    installBrowsers([ "chromium-headless-shell" ]);

    const result = run();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/deno: .*https:\/\/docs\.deno\.com\//);
    expect(result.stderr).toMatch(/bun: .*https:\/\/bun\.sh\//);
    expect(result.stderr).toMatch(/firefox: .*playwright install firefox/);
    expect(result.stderr).toMatch(/webkit: .*playwright install webkit/);
    expect(result.stderr).not.toContain("chromium");
    expect(result.stdout).not.toContain("==> build faxios");
  });

  it("names chromium when only the headed chromium build is installed, not the headless shell", () => {
    fake("deno", "exit 0");
    fake("bun", "exit 0");
    installBrowsers([ "chromium", "firefox", "webkit" ]);

    const result = run();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/chromium: .*playwright install chromium/);
    expect(result.stderr).not.toMatch(/deno|bun|firefox|webkit/);
    expect(result.stdout).not.toContain("==> build faxios");
  });

  // The headless shell alone (`playwright install --only-shell chromium`) is enough.
  it("continues to the lock, the lockfile guard and the build when every prerequisite is present", () => {
    fake("deno", "exit 0");
    fake("bun", "exit 0");
    installBrowsers(HEADLESS_EXECUTABLES);

    const result = run();

    expect(result.stderr).not.toContain("missing prerequisites");
    expect(result.stdout).toContain("==> build faxios\npnpm --dir ../lib build\n");
    expect(existsSync(join(dir, ".run-tests.lock"))).toBe(false);
  });

  // macOS 14 gets an older WebKit build, installed under its own directory name.
  it("counts a browser installed for a platform's revision override", () => {
    fake("deno", "exit 0");
    fake("bun", "exit 0");
    installBrowsers([ "chromium-headless-shell", "firefox" ]);
    installBrowsers([ "webkit" ], "mac14-arm64");

    const result = run();

    expect(result.stderr).not.toContain("missing prerequisites");
    expect(result.stdout).toContain("==> build faxios\n");
  });
});
