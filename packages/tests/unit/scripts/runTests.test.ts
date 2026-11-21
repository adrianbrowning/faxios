import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
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
  // Replaces any linked tool of the same name rather than writing through the link.
  const fake = (name: string, body: string) => {
    rmSync(join(bin, name), { force: true });
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  // Lays out what `playwright install` leaves for each executable in this checkout's Playwright
  // registry, by its registry name ("chromium" is the headed build, "chromium-headless-shell" the
  // headless one): an empty file at the executable path and the browser directory's
  // INSTALLATION_COMPLETE marker, under `into` (the test's PLAYWRIGHT_BROWSERS_PATH by default).
  const installBrowsers = (names: Array<string>, hostPlatform?: string, into = browsersPath) => {
    const script = `const core = require.resolve("playwright-core/lib/coreBundle", { paths: [ require.resolve("playwright") ] });
const { registry } = require(core).registry;
const installs = ${JSON.stringify(names)}.map(n => registry.findExecutable(n));
console.log(JSON.stringify(installs.map(e => ({ directory: e.directory, executable: e.executablePath() }))));`;
    const installs = JSON.parse(execFileSync(process.execPath, [ "-e", script ], {
      cwd: testsDir,
      env: { PLAYWRIGHT_BROWSERS_PATH: into, ...hostPlatform && { PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: hostPlatform } },
      encoding: "utf8",
    })) as Array<{ directory: string; executable: string; }>;
    for (const { directory, executable } of installs) {
      mkdirSync(dirname(executable), { recursive: true });
      writeFileSync(executable, "");
      writeFileSync(join(directory, "INSTALLATION_COMPLETE"), "");
    }
  };
  // hostPlatform sets the Playwright platform the script checks for, through the variable Playwright
  // itself reads; without it the script works out this machine's platform. env adds to or, with
  // undefined, removes from the script's environment. OSTYPE set there replaces the OS bash reports.
  const run = (hostPlatform?: string, env: NodeJS.ProcessEnv = {}) => {
    const started = performance.now();
    const result = spawnSync(join(bin, "bash"), [ join(dir, "run-tests.sh") ], {
      env: { PATH: bin, HOME: dir, PLAYWRIGHT_BROWSERS_PATH: browsersPath, ...hostPlatform && { PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: hostPlatform }, ...env },
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
    if (process.platform === "darwin") for (const tool of [ "sw_vers", "sysctl" ]) symlinkSync(realTool(tool), join(bin, tool));
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

  // AGENTS.md: Linux also needs the browsers' system libraries, which --with-deps installs.
  it.each([
    [ "linux-gnu", " --with-deps" ],
    [ "darwin23", "" ],
  ])("on OSTYPE %s, gives the browser install command with %j after it", (ostype, suffix) => {
    fake("deno", "exit 0");
    fake("bun", "exit 0");
    installBrowsers([ "chromium-headless-shell", "firefox" ]);

    const result = run(undefined, { OSTYPE: ostype });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toBe(`run-tests.sh: missing prerequisites:\n  webkit: pnpm --filter @faxios/tests exec playwright install webkit${suffix}\n`);
  });

  // A fresh clone before `pnpm install` has no Playwright to read the browser list from.
  it("names deno, bun and every browser, and says to run pnpm install before installing the browsers, when node_modules is missing", () => {
    unlinkSync(join(dir, "node_modules"));

    const result = run();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/missing prerequisites:\n {2}deno: .*\n {2}bun: .*\n {2}chromium, firefox, webkit: .*run pnpm install, then pnpm --filter @faxios\/tests exec playwright install chromium firefox webkit/);
    expect(result.stderr).not.toContain("No such file");
    expect(result.stdout).not.toContain("==> build faxios");
  });

  // Without sw_vers the macOS platform is unknown, so no override applies; the check still finishes.
  it("still names deno and bun when sw_vers is not on PATH", () => {
    rmSync(join(bin, "sw_vers"), { force: true });
    installBrowsers(HEADLESS_EXECUTABLES);

    const result = run();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/missing prerequisites:\n {2}deno: .*\n {2}bun: /);
    expect(result.stderr).not.toContain("sw_vers");
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

  // What `pnpm check` meets on most machines: Playwright's default cache directory for this OS.
  it("finds browsers in Playwright's default cache directory when PLAYWRIGHT_BROWSERS_PATH is unset", () => {
    fake("deno", "exit 0");
    fake("bun", "exit 0");
    const defaultDir = process.platform === "darwin" ? join(dir, "Library/Caches/ms-playwright") : join(dir, ".cache/ms-playwright");
    installBrowsers(HEADLESS_EXECUTABLES, undefined, defaultDir);

    const result = run(undefined, { PLAYWRIGHT_BROWSERS_PATH: undefined });

    expect(result.stderr).not.toContain("missing prerequisites");
    expect(result.stdout).toContain("==> build faxios\n");
  });

  it("uses XDG_CACHE_HOME for the default browsers directory on Linux", () => {
    fake("deno", "exit 0");
    fake("bun", "exit 0");
    // No macOS revision override applies on Linux, so the main revisions count.
    installBrowsers(HEADLESS_EXECUTABLES, "ubuntu24.04-x64", join(dir, "xdg/ms-playwright"));

    const result = run(undefined, { OSTYPE: "linux-gnu", PLAYWRIGHT_BROWSERS_PATH: undefined, XDG_CACHE_HOME: join(dir, "xdg") });

    expect(result.stderr).not.toContain("missing prerequisites");
    expect(result.stdout).toContain("==> build faxios\n");
  });

  // Playwright's win32 default is %LOCALAPPDATA%\ms-playwright; Git Bash and Cygwin see it through cygpath.
  it("finds browsers under %LOCALAPPDATA%\\ms-playwright under Git Bash", () => {
    fake("deno", "exit 0");
    fake("bun", "exit 0");
    const localAppData = join(dir, "c/Users/dev/AppData/Local");
    fake("cygpath", `[ "$1" = -u ] && [ "$2" = 'C:\\Users\\dev\\AppData\\Local' ] && echo '${localAppData}'`);
    installBrowsers(HEADLESS_EXECUTABLES, "win64", join(localAppData, "ms-playwright"));

    const result = run(undefined, { OSTYPE: "msys", PLAYWRIGHT_BROWSERS_PATH: undefined, LOCALAPPDATA: "C:\\Users\\dev\\AppData\\Local" });

    expect(result.stderr).not.toContain("missing prerequisites");
    expect(result.stdout).toContain("==> build faxios\n");
  });

  it("finds browsers under ~/AppData/Local/ms-playwright under Cygwin when LOCALAPPDATA is unset", () => {
    fake("deno", "exit 0");
    fake("bun", "exit 0");
    installBrowsers(HEADLESS_EXECUTABLES, "win64", join(dir, "AppData/Local/ms-playwright"));

    const result = run(undefined, { OSTYPE: "cygwin", PLAYWRIGHT_BROWSERS_PATH: undefined });

    expect(result.stderr).not.toContain("missing prerequisites");
    expect(result.stdout).toContain("==> build faxios\n");
  });

  // macOS 14 gets an older WebKit build, installed under its own directory name.
  it("counts a browser installed for this platform's revision override", () => {
    fake("deno", "exit 0");
    fake("bun", "exit 0");
    installBrowsers([ "chromium-headless-shell", "firefox" ]);
    installBrowsers([ "webkit" ], "mac14-arm64");

    const result = run("mac14-arm64");

    expect(result.stderr).not.toContain("missing prerequisites");
    expect(result.stdout).toContain("==> build faxios\n");
  });

  // The script names the platform from sw_vers and the Apple-silicon probe, as Playwright does. The
  // probe holds under Rosetta, where a translated bash's uname -m prints x86_64. OSTYPE makes bash
  // take the macOS branch on any host.
  it("names the platform mac14-arm64 from sw_vers on Apple silicon, also under Rosetta", () => {
    fake("deno", "exit 0");
    fake("bun", "exit 0");
    fake("sw_vers", "[ \"$1\" = -productVersion ] && echo 14.5");
    fake("uname", "echo x86_64");
    fake("sysctl", "[ \"$1 $2\" = \"-n hw.optional.arm64\" ] && echo 1");
    installBrowsers([ "chromium-headless-shell", "firefox" ]);
    installBrowsers([ "webkit" ], "mac14-arm64");

    const result = run(undefined, { OSTYPE: "darwin23" });

    expect(result.stderr).not.toContain("missing prerequisites");
    expect(result.stdout).toContain("==> build faxios\n");
  });

  // An Intel Mac has no hw.optional.arm64, so sysctl prints nothing and fails.
  it("names the platform mac14 from sw_vers on an Intel Mac", () => {
    fake("deno", "exit 0");
    fake("bun", "exit 0");
    fake("sw_vers", "[ \"$1\" = -productVersion ] && echo 14.5");
    fake("sysctl", "echo \"sysctl: unknown oid '$2'\" >&2; exit 1");
    installBrowsers([ "chromium-headless-shell", "firefox" ]);
    installBrowsers([ "webkit" ], "mac14");

    const result = run(undefined, { OSTYPE: "darwin23" });

    expect(result.stderr).not.toContain("missing prerequisites");
    expect(result.stdout).toContain("==> build faxios\n");
  });

  // A Mac upgraded from macOS 14 keeps the old override build, which macOS 15 doesn't launch.
  it("names webkit when only another platform's revision override is installed", () => {
    fake("deno", "exit 0");
    fake("bun", "exit 0");
    installBrowsers([ "chromium-headless-shell", "firefox" ]);
    installBrowsers([ "webkit" ], "mac14-arm64");

    const result = run("mac15-arm64");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/webkit: .*playwright install webkit/);
    expect(result.stderr).not.toMatch(/deno|bun|chromium|firefox/);
    expect(result.stdout).not.toContain("==> build faxios");
  });

  // Playwright launches the override build on a platform that has one, never the main revision.
  it("names webkit when this platform has a revision override and only the main revision is installed", () => {
    fake("deno", "exit 0");
    fake("bun", "exit 0");
    installBrowsers([ "chromium-headless-shell", "firefox" ]);
    installBrowsers([ "webkit" ], "mac15-arm64");

    const result = run("mac14-arm64");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/webkit: .*playwright install webkit/);
    expect(result.stderr).not.toMatch(/deno|bun|chromium|firefox/);
    expect(result.stdout).not.toContain("==> build faxios");
  });
});
