import type { SpawnSyncReturns } from "node:child_process";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve(import.meta.dirname, "../../../../scripts/intent-restack.sh");
const state = ".intent/review-state.json";
// The report the script passed to `--record`, which the fake pnpm saves.
const recordedReport = ".bin/recorded.json";
// Each test builds a git repo and runs bash, git and the fake pnpm, which run slowly under full-suite load.
const subprocessTests = { timeout: 60_000 };

type Item = { changedFiles: Array<string>; id: string; };
type FakeOptions = {
  /** `--record` fails on this branch with exit 4, the code the script keeps for a check that failed on pending items alone, so a test can show another command's 4 becomes 1. */
  failRecordOn?: string;
  /** `review --json` prints its report but then fails (exit 2) on this branch. */
  failReviewOn?: string;
  /** `check` fails skill validation on this branch, before it looks at anything else. */
  invalidOn?: string;
  /** On this branch every pending item of `status --json` carries an authoring problem. */
  itemProblemsOn?: string;
  /** `--json` items for these branches; the others get the default items. */
  perBranch?: Record<string, Array<Item>>;
  /** `status --json` lists an authoring problem on this branch, which also fails `check`. */
  problemsOn?: string;
  /** A generated file is stale on this branch, which fails `check` and shows in `status --json`. */
  staleOn?: string;
};

// Stands in for `pnpm exec intent maintainer`. `--json` prints the pending items. `--record` saves the
// report to .bin/recorded.json and merges its annotated items into the review state. `status --json`
// gives the real fields the script reads: problems, staleFiles and the pending review items with
// their own problems.
// `check` fails on validation first; otherwise, like Intent, it fails with "Maintainer check
// failed." while a file is stale, a problem is listed or an item of the last `--json` report has
// no recorded outcome.
function fakePnpm(items: Array<Item>, { failRecordOn = "", failReviewOn = "", invalidOn = "", itemProblemsOn = "", perBranch = {}, problemsOn = "", staleOn = "" }: FakeOptions = {}) {
  const arms = [ ...Object.entries(perBranch), [ "*", items ] as const ]
    .map(([ branch, branchItems ]) => `      ${branch}) echo '${JSON.stringify({ items: branchItems })}' ;;`);
  return `#!/bin/sh
dir="$(dirname "$0")"
branch="$(git branch --show-current)"
recorded="$dir/recorded.json"
[ -f "$recorded" ] || recorded=/dev/null
stale='[]'
if [ "$branch" = "${staleOn}" ]; then stale='["packages/lib/package.json"]'; fi
problems='[]'
if [ "$branch" = "${problemsOn}" ]; then problems='["x: skill still needs authoring."]'; fi
itemProblems='[]'
if [ "$branch" = "${itemProblemsOn}" ]; then itemProblems='["Source matched no available files"]'; fi
pending() {
  jq -c --slurpfile r "$recorded" '[.items[].id] - [($r[0].items // [])[] | select(.outcome) | .id]' "$dir/report.json"
}
case "$*" in
  *"maintainer status"*)
    jq -n --argjson stale "$stale" --argjson problems "$problems" --argjson itemProblems "$itemProblems" --argjson items "$(pending)" \\
      '{problems: $problems, staleFiles: $stale, review: {items: ($items | map({id: ., problems: $itemProblems}))}}' ;;
  *--json*)
    rm -f "$dir/recorded.json"
    case "$branch" in
${arms.join("\n")}
    esac | tee "$dir/report.json"
    if [ "$branch" = "${failReviewOn}" ]; then echo "review failed" >&2; exit 2; fi ;;
  *--record*)
    if [ "$branch" = "${failRecordOn}" ]; then echo "record rejected" >&2; exit 4; fi
    cp .intent/review.json "$dir/recorded.json"
    jq --slurpfile r .intent/review.json '.items += ($r[0].items | map(select(.outcome) | {key: .id, value: {outcome, reason, evidence}}) | from_entries)' ${state} > "$dir/state.json"
    mv "$dir/state.json" ${state} ;;
  *)
    if [ "$branch" = "${invalidOn}" ]; then echo "SKILL.md validation failed" >&2; exit 1; fi
    if [ "$stale" != "[]" ] || [ "$problems" != "[]" ] || [ "$(pending)" != "[]" ]; then
      echo "Maintainer check failed. Resolve the authoring issues, run intent maintainer sync, and record review outcomes." >&2
      exit 1
    fi
    echo "checked" ;;
esac
`;
}

type Repo = Disposable & {
  git: (...args: Array<string>) => string;
  read: (path: string) => string;
  repo: string;
  run: (...args: Array<string>) => SpawnSyncReturns<string>;
  /** Installs a fake command in .bin. */
  tool: (name: string, source: string) => void;
  write: (path: string, content: string) => void;
};

// A temp git repo on branch main, with a copy of the script and a .bin directory (ignored) first on
// PATH. Disposing it deletes the repo.
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
  return { repo, git, run, tool, write, read, [Symbol.dispose]: () => rmSync(repo, { recursive: true, force: true }) };
}

function recorded(repo: Repo) {
  const report = JSON.parse(repo.read(recordedReport)) as { items: Array<Item & { outcome?: string; }>; };
  return report.items;
}

// A feature branch that changes a.txt, checked out, while main has moved on.
function rebaseRepo() {
  const repo = makeRepo();
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
  return repo;
}

describe("scripts/intent-restack.sh rebase", subprocessTests, () => {
  it("exits non-zero and changes nothing when git refuses to rebase", () => {
    using repo = rebaseRepo();
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

const outsideRecord = { outcome: "no-change", reason: "earlier PR", evidence: [ "b.txt" ] };

// A feature branch on main that changes a.txt.
function recordRepo() {
  const repo = makeRepo();
  repo.write("a.txt", "a\n");
  repo.write("b.txt", "b\n");
  // An earlier PR recorded the outside item; review-state.json is cumulative, so every layer carries it.
  repo.write(state, JSON.stringify({ items: { "skill:outside": outsideRecord } }));
  repo.git("add", ".");
  repo.git("commit", "--quiet", "-m", "base");
  repo.git("checkout", "--quiet", "-b", "feature");
  repo.write("a.txt", "feature\n");
  repo.git("commit", "--quiet", "-am", "feature");
  return repo;
}

describe("scripts/intent-restack.sh record", subprocessTests, () => {
  it("records only the items whose files are in the layer's diff, even when others have an earlier record", () => {
    using repo = recordRepo();
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
    using repo = recordRepo();
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
    // --record rewrote the file, so only an amend leaves the tree clean with HEAD holding that copy.
    expect(repo.git("status", "--porcelain")).toBe("");
    expect(repo.git("show", `HEAD:${state}`)).toBe(repo.read(state).trim());
  });

  it("leaves pending an item with only some of its files, or none, in the layer's diff", () => {
    using repo = recordRepo();
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
    using repo = recordRepo();
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

  it("amends a staged edit to the review state even when it records nothing", () => {
    using repo = recordRepo();
    repo.tool("pnpm-review", fakePnpm([{ id: "skill:outside", changedFiles: [ "b.txt" ] }]));
    // `check` passes here, so the run's exit shows the amend alone.
    repo.tool("pnpm", `#!/bin/sh\ncase "$*" in\n  *"maintainer check"*) echo checked ;;\n  *) exec "$(dirname "$0")/pnpm-review" "$@" ;;\nesac\n`);
    const staged = JSON.stringify({ items: { "skill:outside": outsideRecord, "skill:staged": outsideRecord } });
    repo.write(state, staged);
    repo.git("add", state);

    const result = repo.run("record", "main", "HEAD");

    expect(result.status).toBe(0);
    expect(repo.git("show", `HEAD:${state}`)).toBe(staged);
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  it("refuses to record when a tracked file has uncommitted changes", () => {
    using repo = recordRepo();
    repo.tool("pnpm", fakePnpm([{ id: "skill:item", changedFiles: [ "a.txt" ] }]));
    const head = repo.git("rev-parse", "HEAD");
    repo.write("a.txt", "dirty\n");

    const result = repo.run("record", "main", "HEAD");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("uncommitted changes");
    expect(existsSync(join(repo.repo, recordedReport))).toBe(false);
    expect(repo.git("rev-parse", "HEAD")).toBe(head);
  });

  it("prints every line of a failed check, not only the last", () => {
    using repo = recordRepo();
    repo.tool("pnpm", `#!/bin/sh
case "$*" in
  *--json*) echo '{"items":[]}' ;;
  *) printf 'Run intent maintainer sync: package.json\\n  Review skill x\\n'; echo "Maintainer check failed." >&2; exit 1 ;;
esac
`);

    const result = repo.run("record", "main", "HEAD");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Run intent maintainer sync: package.json");
    expect(result.stdout).toContain("Review skill x");
  });

  it("records the items for both paths of a file the layer renamed", () => {
    using repo = recordRepo();
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
    using repo = recordRepo();
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

const items = [{ id: "skill:a", changedFiles: [ "a.txt" ] }, { id: "skill:other", changedFiles: [ "b.txt" ] }];
const perBranch = { l2: [{ id: "skill:c", changedFiles: [ "c.txt" ] }] };

// Two layers on main: l1 changes a.txt, l2 adds c.txt; on l1 skill:other stays pending.
function stackRepo() {
  const repo = makeRepo();
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
  const view = {
    trunk: "main",
    branches: [
      { name: "l1", base: repo.git("rev-parse", "main"), isMerged: false },
      { name: "l2", base: repo.git("rev-parse", "l1"), isMerged: false },
    ],
  };
  repo.tool("gh", `#!/bin/sh\necho '${JSON.stringify(view)}'\n`);
  return repo;
}

describe("scripts/intent-restack.sh stack", subprocessTests, () => {
  it("goes on past a layer whose check fails only on pending review items, then lists that layer", () => {
    using repo = stackRepo();
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

  it("exits 0 when every layer passes its check, rebasing the layers above", () => {
    using repo = stackRepo();
    repo.tool("pnpm", fakePnpm([{ id: "skill:a", changedFiles: [ "a.txt" ] }], { perBranch }));

    const result = repo.run("stack");

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("check failed on these layers");
    expect(repo.git("rev-parse", "l2~1")).toBe(repo.git("rev-parse", "l1"));
  });

  it("stops at the first layer when a tracked file has uncommitted changes", () => {
    using repo = stackRepo();
    const layer1 = repo.git("rev-parse", "l1");
    const layer2 = repo.git("rev-parse", "l2");
    repo.tool("pnpm", fakePnpm(items, { perBranch }));
    repo.git("checkout", "--quiet", "l1");
    repo.write("b.txt", "dirty\n");

    const result = repo.run("stack");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("uncommitted changes");
    expect(result.stdout).not.toContain("== l2");
    expect(repo.git("rev-parse", "l1")).toBe(layer1);
    expect(repo.git("rev-parse", "l2")).toBe(layer2);
  });

  it("stops at a layer that fails for any other reason, even with exit 4, leaving the layers above alone", () => {
    using repo = stackRepo();
    const layer2 = repo.git("rev-parse", "l2");
    repo.tool("pnpm", fakePnpm(items, { perBranch, failRecordOn: "l1" }));

    const result = repo.run("stack");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("record rejected");
    expect(result.stderr).not.toContain("check failed on these layers");
    expect(result.stdout).not.toContain("== l2");
    expect(repo.git("rev-parse", "l2")).toBe(layer2);
  });

  it("exits 1, not 4, when `gh stack view` fails with exit 4", () => {
    using repo = stackRepo();
    repo.tool("pnpm", fakePnpm(items, { perBranch }));
    repo.tool("gh", "#!/bin/sh\necho 'gh failed' >&2\nexit 4\n");

    const result = repo.run("stack");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("gh failed");
  });

  it("exits 1, not 4, when checking out a layer fails with exit 4, leaving the layers above alone", () => {
    using repo = stackRepo();
    const layer2 = repo.git("rev-parse", "l2");
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- the fake git hands every other call to the PATH git
    const git = execFileSync("sh", [ "-c", "command -v git" ], { encoding: "utf8" }).trim();
    repo.tool("pnpm", fakePnpm(items, { perBranch }));
    repo.tool("git", `#!/bin/sh\nif [ "$1" = checkout ]; then echo 'checkout failed' >&2; exit 4; fi\nexec '${git}' "$@"\n`);

    const result = repo.run("stack");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("checkout failed");
    expect(result.stdout).not.toContain("== l2");
    expect(repo.git("rev-parse", "l2")).toBe(layer2);
  });

  // l1 also leaves skill:other pending, so only the named cause stops `stack`.
  it.each([
    [ "a stale file", { staleOn: "l1" }],
    [ "an authoring problem", { problemsOn: "l1" }],
    [ "a review item with authoring problems", { itemProblemsOn: "l1" }],
  ])("stops at a layer whose check fails on %s, leaving the layers above alone", (_cause, options) => {
    using repo = stackRepo();
    const layer2 = repo.git("rev-parse", "l2");
    repo.tool("pnpm", fakePnpm(items, { perBranch, ...options }));

    const result = repo.run("stack");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Maintainer check failed.");
    expect(result.stderr).not.toContain("check failed on these layers");
    expect(result.stdout).not.toContain("== l2");
    expect(repo.git("rev-parse", "l2")).toBe(layer2);
  });

  it("stops at a layer whose skills fail validation, even with review items pending", () => {
    using repo = stackRepo();
    const layer2 = repo.git("rev-parse", "l2");
    repo.tool("pnpm", fakePnpm(items, { perBranch, invalidOn: "l1" }));

    const result = repo.run("stack");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SKILL.md validation failed");
    expect(result.stderr).not.toContain("check failed on these layers");
    expect(result.stdout).not.toContain("== l2");
    expect(repo.git("rev-parse", "l2")).toBe(layer2);
  });

  it("stops at a layer whose review report fails, even when it printed a report", () => {
    using repo = stackRepo();
    const layer2 = repo.git("rev-parse", "l2");
    repo.tool("pnpm", fakePnpm(items, { perBranch, failReviewOn: "l1" }));

    const result = repo.run("stack");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("review failed");
    expect(result.stdout).not.toContain("== l2");
    expect(repo.git("rev-parse", "l2")).toBe(layer2);
  });
});

// The workspace's installed packages; the contract repo links them so `pnpm exec intent` finds Intent.
const nodeModules = resolve(import.meta.dirname, "../../../../node_modules");
const authoringMarker = "<!-- intent:needs-authoring -->";

// The stderr text and `status --json` fields check_layer reads, from the real Intent CLI.
describe("@tanstack/intent maintainer contract used by scripts/intent-restack.sh", () => {
  it("fails check with 'Maintainer check failed.' on a pending item alone, which the script turns into exit 4", () => {
    using repo = makeRepo();
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- the script runs the PATH pnpm, so the test does too
    const run = (...args: Array<string>) => spawnSync("pnpm", [ "exec", "intent", "maintainer", ...args, "--artifacts", "_artifacts" ], { cwd: repo.repo, encoding: "utf8" });
    symlinkSync(nodeModules, join(repo.repo, "node_modules"));
    repo.write(".gitignore", ".bin/\nnode_modules\n");
    mkdirSync(join(repo.repo, "src"));
    repo.write("package.json", JSON.stringify({ name: "x", version: "1.0.0" }));
    repo.write("src/a.ts", "a\n");
    expect(run("setup", "--distribution", "none").status).toBe(0);
    expect(run("add", "x", "--domain", "core", "--description", "Use when testing x.", "--source", "src/a.ts").status).toBe(0);
    // setup and add mark skill_spec.md and the new SKILL.md as unauthored and record no task for the
    // skill: authoring problems that status lists. Author them so only the review item stays.
    repo.write("_artifacts/domain_map.yaml", repo.read("_artifacts/domain_map.yaml").replace("tasks: []", "tasks: [test x]"));
    repo.git("add", ".");
    for (const file of repo.git("ls-files").split("\n")) {
      const content = repo.read(file);
      if (content.includes(authoringMarker)) repo.write(file, content.replaceAll(authoringMarker, ""));
    }
    expect(run("sync").status).toBe(0);
    repo.git("add", ".");
    repo.git("commit", "--quiet", "-m", "base");
    repo.write("src/a.ts", "b\n");
    repo.git("commit", "--quiet", "-am", "change");

    const check = run("check", "--base", "HEAD~1");
    const status = JSON.parse(run("status", "--base", "HEAD~1", "--json").stdout) as { problems: unknown; review: { items: Array<{ problems: unknown; }>; }; staleFiles: unknown; };

    expect(check.status).not.toBe(0);
    expect(check.stderr).toMatch(/^Maintainer check failed\./m);
    expect(status.problems).toEqual([]);
    expect(status.staleFiles).toEqual([]);
    expect(status.review.items.length).toBeGreaterThan(0);
    for (const item of status.review.items) expect(item.problems).toEqual([]);
    // record finds no item in HEAD's own (empty) diff, so it records nothing and only checks.
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- the script runs the PATH pnpm and git, so it runs under the PATH bash
    const script = spawnSync("bash", [ "scripts/intent-restack.sh", "record", "HEAD", "HEAD" ], { cwd: repo.repo, encoding: "utf8" });
    expect(script.status).toBe(4);
  }, 30_000);
});
