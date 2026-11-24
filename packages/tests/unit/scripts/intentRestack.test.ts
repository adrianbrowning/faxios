import type { SpawnSyncReturns } from "node:child_process";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = resolve(import.meta.dirname, "../../../../scripts/intent-restack.sh");
const state = ".intent/review-state.json";
// The report the script passed to `--record`, which the fake pnpm saves.
const recordedReport = ".bin/recorded.json";

type Item = { changedFiles: Array<string>; id: string; };
type FakeOptions = {
  /** `--record` fails (exit 2) on this branch. */
  failRecordOn?: string;
  /** `--json` items for these branches; the others get the default items. */
  perBranch?: Record<string, Array<Item>>;
};

// Stands in for `pnpm exec intent maintainer`. `--json` prints the pending items. `--record` saves the
// report to .bin/recorded.json and merges its annotated items into the review state. `check` fails
// while an item of the last `--json` report has no outcome in the recorded report.
function fakePnpm(items: Array<Item>, { perBranch = {}, failRecordOn = "" }: FakeOptions = {}) {
  const arms = [ ...Object.entries(perBranch), [ "*", items ] as const ]
    .map(([ branch, branchItems ]) => `      ${branch}) echo '${JSON.stringify({ items: branchItems })}' ;;`);
  return `#!/bin/sh
dir="$(dirname "$0")"
branch="$(git branch --show-current)"
case "$*" in
  *--json*)
    rm -f "$dir/recorded.json"
    case "$branch" in
${arms.join("\n")}
    esac | tee "$dir/report.json" ;;
  *--record*)
    if [ "$branch" = "${failRecordOn}" ]; then echo "record rejected" >&2; exit 2; fi
    cp .intent/review.json "$dir/recorded.json"
    jq --slurpfile r .intent/review.json '.items += ($r[0].items | map(select(.outcome) | {key: .id, value: {outcome, reason, evidence}}) | from_entries)' ${state} > "$dir/state.json"
    mv "$dir/state.json" ${state} ;;
  *)
    recorded="$dir/recorded.json"
    [ -f "$recorded" ] || recorded=/dev/null
    if ! jq -e --slurpfile r "$recorded" '[.items[].id] - [($r[0].items // [])[] | select(.outcome) | .id] | length == 0' "$dir/report.json" > /dev/null; then
      echo "pending review items" >&2
      exit 1
    fi
    echo "checked" ;;
esac
`;
}

type Repo = {
  git: (...args: Array<string>) => string;
  read: (path: string) => string;
  repo: string;
  run: (...args: Array<string>) => SpawnSyncReturns<string>;
  /** Installs a fake command in .bin. */
  tool: (name: string, source: string) => void;
  write: (path: string, content: string) => void;
};

// A temp git repo on branch main, with a copy of the script and a .bin directory (ignored) first on PATH.
function makeRepo(): Repo {
  const repo = mkdtempSync(join(tmpdir(), "faxios-restack-"));
  const bin = join(repo, ".bin");
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.com",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- the script runs the PATH git, so the test does too
  const git = (...args: Array<string>) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" }).trim();
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- the PATH must hold the fake tools the script calls
  const run = (...args: Array<string>) => spawnSync("bash", [ "scripts/intent-restack.sh", ...args ], { cwd: repo, env, encoding: "utf8" });
  const tool = (name: string, source: string) => {
    writeFileSync(join(bin, name), source);
    chmodSync(join(bin, name), 0o755);
  };
  const write = (path: string, content: string) => writeFileSync(join(repo, path), content);
  const read = (path: string) => readFileSync(join(repo, path), "utf8");

  mkdirSync(bin);
  mkdirSync(join(repo, "scripts"));
  cpSync(script, join(repo, "scripts/intent-restack.sh"));
  git("init", "--quiet", "-b", "main");
  write(".gitignore", ".bin/\n");
  mkdirSync(join(repo, ".intent"));
  return { repo, git, run, tool, write, read };
}

function recorded(repo: Repo) {
  const report = JSON.parse(repo.read(recordedReport)) as { items: Array<Item & { outcome?: string; }>; };
  return report.items;
}

describe("scripts/intent-restack.sh rebase", () => {
  let repo: Repo;

  beforeEach(() => {
    repo = makeRepo();
    repo.tool("pnpm", fakePnpm([{ id: "skill:item", changedFiles: [ "a.txt" ] }]));
    repo.write(state, "{\"items\":{}}\n");
    repo.write("a.txt", "a\n");
    repo.git("add", ".");
    repo.git("commit", "--quiet", "-m", "base");
    repo.git("checkout", "--quiet", "-b", "feature");
    repo.write("a.txt", "feature\n");
    repo.git("commit", "--quiet", "-am", "feature");
    repo.git("checkout", "--quiet", "main");
    repo.write("b.txt", "b\n");
    repo.git("add", "b.txt");
    repo.git("commit", "--quiet", "-m", "main moves");
    repo.git("checkout", "--quiet", "feature");
  });

  afterEach(() => {
    rmSync(repo.repo, { recursive: true, force: true });
  });

  it("exits non-zero and changes nothing when git refuses to rebase", () => {
    const head = repo.git("rev-parse", "HEAD");
    const reviewState = repo.read(state);
    repo.write("a.txt", "unstaged\n");

    const result = repo.run("rebase", "main");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/unstaged changes|cannot rebase/i);
    expect(repo.git("rev-parse", "HEAD")).toBe(head);
    expect(repo.read(state)).toBe(reviewState);
  });
});

describe("scripts/intent-restack.sh record", () => {
  let repo: Repo;
  const outsideRecord = { outcome: "no-change", reason: "earlier PR", evidence: [ "b.txt" ] };

  beforeEach(() => {
    repo = makeRepo();
    repo.write("a.txt", "a\n");
    repo.write("b.txt", "b\n");
    // An earlier PR recorded the outside item; review-state.json is cumulative, so every layer carries it.
    repo.write(state, JSON.stringify({ items: { "skill:outside": outsideRecord } }));
    repo.git("add", ".");
    repo.git("commit", "--quiet", "-m", "base");
    repo.git("checkout", "--quiet", "-b", "feature");
    repo.write("a.txt", "feature\n");
    repo.git("commit", "--quiet", "-am", "feature");
  });

  afterEach(() => {
    rmSync(repo.repo, { recursive: true, force: true });
  });

  it("records only the items whose files are in the layer's diff, even when others have an earlier record", () => {
    repo.tool("pnpm", fakePnpm([{ id: "skill:item", changedFiles: [ "a.txt" ] }, { id: "skill:outside", changedFiles: [ "b.txt" ] }]));

    const result = repo.run("record", "main", "HEAD");

    // The check still fails on the item left pending.
    expect(result.status).toBe(4);
    expect(result.stdout).toContain("skill:item: no-change");
    expect(result.stdout).toContain("skill:outside: left pending, outside this layer");
    expect(recorded(repo)).toEqual([
      expect.objectContaining({ id: "skill:item", outcome: "no-change" }),
      { id: "skill:outside", changedFiles: [ "b.txt" ] },
    ]);
  });

  it("gives an item in the layer's diff its earlier record and amends it into the last commit", () => {
    const earlier = { outcome: "updated", reason: "earlier reason", evidence: [ "a.txt" ] };
    repo.write(state, JSON.stringify({ items: { "skill:outside": outsideRecord, "skill:item": earlier } }));
    repo.git("commit", "--quiet", "-am", "record");
    repo.tool("pnpm", fakePnpm([{ id: "skill:item", changedFiles: [ "a.txt" ] }]));
    const parent = repo.git("rev-parse", "HEAD~1");

    const result = repo.run("record", "main", "HEAD");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("skill:item: updated");
    expect(recorded(repo)).toEqual([{ id: "skill:item", changedFiles: [ "a.txt" ], ...earlier }]);
    expect(repo.git("rev-parse", "HEAD~1")).toBe(parent);
    expect(JSON.parse(repo.git("show", `HEAD:${state}`))).toEqual({ items: { "skill:outside": outsideRecord, "skill:item": earlier } });
  });

  it("leaves pending an item with only some of its files, or none, in the layer's diff", () => {
    repo.tool("pnpm", fakePnpm([
      { id: "skill:both", changedFiles: [ "a.txt", "b.txt" ] },
      { id: "skill:none", changedFiles: [] },
      { id: "skill:item", changedFiles: [ "a.txt" ] },
    ]));

    const result = repo.run("record", "main", "HEAD");

    expect(result.status).toBe(4);
    expect(result.stdout).toContain("skill:both: left pending, outside this layer");
    expect(result.stdout).toContain("skill:none: left pending, outside this layer");
    expect(recorded(repo).slice(0, 2)).toEqual([
      { id: "skill:both", changedFiles: [ "a.txt", "b.txt" ] },
      { id: "skill:none", changedFiles: [] },
    ]);
  });

  it("records nothing and amends nothing when no item is in the layer's diff", () => {
    repo.tool("pnpm", fakePnpm([{ id: "skill:outside", changedFiles: [ "b.txt" ] }]));
    const head = repo.git("rev-parse", "HEAD");
    const reviewState = repo.read(state);

    const result = repo.run("record", "main", "HEAD");

    expect(result.status).toBe(4);
    expect(result.stdout).toContain("skill:outside: left pending, outside this layer");
    expect(existsSync(join(repo.repo, recordedReport))).toBe(false);
    expect(repo.git("rev-parse", "HEAD")).toBe(head);
    expect(repo.read(state)).toBe(reviewState);
  });

  it("records the items for both paths of a file the layer renamed", () => {
    // Intent lists a rename as its old and its new path (`git diff --no-renames`).
    repo.tool("pnpm", fakePnpm([{ id: "source:b.txt", changedFiles: [ "b.txt" ] }, { id: "source:c.txt", changedFiles: [ "c.txt" ] }]));
    repo.git("mv", "b.txt", "c.txt");
    repo.git("commit", "--quiet", "-m", "rename");

    const result = repo.run("record", "main", "HEAD");

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("left pending");
    expect(recorded(repo)).toEqual([
      expect.objectContaining({ id: "source:b.txt", outcome: "no-change" }),
      expect.objectContaining({ id: "source:c.txt", outcome: "no-change" }),
    ]);
  });

  it("records an item for a file whose path git would quote", () => {
    // Intent lists raw paths (`git diff -z`); git quotes non-ASCII bytes in its plain output.
    repo.tool("pnpm", fakePnpm([{ id: "source:café.txt", changedFiles: [ "café.txt" ] }]));
    repo.write("café.txt", "c\n");
    repo.git("add", "café.txt");
    repo.git("commit", "--quiet", "-m", "café");

    const result = repo.run("record", "main", "HEAD");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("source:café.txt: no-change");
  });
});

describe("scripts/intent-restack.sh stack", () => {
  let repo: Repo;
  let layer2: string;
  const items = [{ id: "skill:a", changedFiles: [ "a.txt" ] }, { id: "skill:other", changedFiles: [ "b.txt" ] }];
  const perBranch = { l2: [{ id: "skill:c", changedFiles: [ "c.txt" ] }] };

  // Two layers on main: l1 changes a.txt, l2 adds c.txt.
  beforeEach(() => {
    repo = makeRepo();
    repo.write("a.txt", "a\n");
    repo.write("b.txt", "b\n");
    repo.write(state, "{\"items\":{}}\n");
    repo.git("add", ".");
    repo.git("commit", "--quiet", "-m", "base");
    repo.git("update-ref", "refs/remotes/origin/main", "main");
    repo.git("checkout", "--quiet", "-b", "l1");
    repo.write("a.txt", "l1\n");
    repo.git("commit", "--quiet", "-am", "l1");
    repo.git("checkout", "--quiet", "-b", "l2");
    repo.write("c.txt", "c\n");
    repo.git("add", "c.txt");
    repo.git("commit", "--quiet", "-m", "l2");
    layer2 = repo.git("rev-parse", "l2");
    const view = {
      trunk: "main",
      branches: [
        { name: "l1", base: repo.git("rev-parse", "main"), isMerged: false },
        { name: "l2", base: repo.git("rev-parse", "l1"), isMerged: false },
      ],
    };
    repo.tool("gh", `#!/bin/sh\necho '${JSON.stringify(view)}'\n`);
  });

  afterEach(() => {
    rmSync(repo.repo, { recursive: true, force: true });
  });

  it("goes on past a layer whose check fails, then lists that layer", () => {
    // l1 leaves skill:other pending.
    repo.tool("pnpm", fakePnpm(items, { perBranch }));

    const result = repo.run("stack");

    expect(result.status).toBe(4);
    expect(result.stdout).toContain("== l2 on l1");
    expect(result.stderr).toMatch(/^ {2}l1$/m);
    expect(result.stderr).not.toMatch(/^ {2}l2$/m);
    expect(repo.git("rev-parse", "l2~1")).toBe(repo.git("rev-parse", "l1"));
    expect(JSON.parse(repo.git("show", `l2:${state}`))).toEqual({
      items: { "skill:a": expect.objectContaining({ outcome: "no-change" }), "skill:c": expect.objectContaining({ outcome: "no-change" }) },
    });
  });

  it("stops at a layer that fails for any other reason, leaving the layers above alone", () => {
    repo.tool("pnpm", fakePnpm(items, { perBranch, failRecordOn: "l1" }));

    const result = repo.run("stack");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("record rejected");
    expect(result.stdout).not.toContain("== l2");
    expect(repo.git("rev-parse", "l2")).toBe(layer2);
  });
});
