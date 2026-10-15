import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = resolve(import.meta.dirname, "../../../../scripts/intent-restack.sh");
const state = ".intent/review-state.json";

// Stands in for `pnpm exec intent`: one pending item, and `--record` writes the review state.
const fakePnpm = `#!/bin/sh
case "$*" in
  *--json*) echo '{"items":[{"id":"skill:item","changedFiles":["a.txt"]}]}' ;;
  *--record*) cp .intent/review.json ${state} ;;
  *) echo "checked" ;;
esac
`;

describe("scripts/intent-restack.sh rebase", () => {
  let repo: string;
  let env: NodeJS.ProcessEnv;
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- the script runs the PATH git, so the test does too
  const git = (...args: Array<string>) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" }).trim();

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "faxios-restack-"));
    const bin = join(repo, ".bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "pnpm"), fakePnpm);
    chmodSync(join(bin, "pnpm"), 0o755);
    mkdirSync(join(repo, "scripts"));
    cpSync(script, join(repo, "scripts/intent-restack.sh"));
    env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.com",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.com",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    };
    git("init", "--quiet", "-b", "main");
    writeFileSync(join(repo, ".gitignore"), ".bin/\n");
    mkdirSync(join(repo, ".intent"));
    writeFileSync(join(repo, state), "{\"items\":{}}\n");
    writeFileSync(join(repo, "a.txt"), "a\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "base");
    git("checkout", "--quiet", "-b", "feature");
    writeFileSync(join(repo, "a.txt"), "feature\n");
    git("commit", "--quiet", "-am", "feature");
    git("checkout", "--quiet", "main");
    writeFileSync(join(repo, "b.txt"), "b\n");
    git("add", "b.txt");
    git("commit", "--quiet", "-m", "main moves");
    git("checkout", "--quiet", "feature");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("exits non-zero and changes nothing when git refuses to rebase", () => {
    const head = git("rev-parse", "HEAD");
    const reviewState = readFileSync(join(repo, state), "utf8");
    writeFileSync(join(repo, "a.txt"), "unstaged\n");

    // eslint-disable-next-line sonarjs/no-os-command-from-path -- the PATH must hold the fake pnpm the script calls
    const result = spawnSync("bash", [ "scripts/intent-restack.sh", "rebase", "main" ], { cwd: repo, env, encoding: "utf8" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/unstaged changes|cannot rebase/i);
    expect(git("rev-parse", "HEAD")).toBe(head);
    expect(readFileSync(join(repo, state), "utf8")).toBe(reviewState);
  });
});
