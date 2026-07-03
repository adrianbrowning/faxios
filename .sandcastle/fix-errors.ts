import { readFileSync, existsSync, rmSync } from "node:fs";
import { execFile } from "node:child_process";
import { resolve, dirname } from "node:path";
import { claudeCode, createSandbox } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
// import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";

const MAX_OUTER = 10;
const MAX_TS_ROUNDS = 100;
const MAX_LINT_ROUNDS = 100;
const MAX_BUILD_ROUNDS = 10;

const ImageName = "sandcastle:add_typescript";
const LintTS = "pnpm --filter faxios lint:ts";
const LintESFix = "pnpm --filter faxios lint:fix";
const BuildCmd = "pnpm --filter faxios build";
const getLogName = (_phase: string) => `.sandcastle/logs/fix-errors.log`;
const getBranchName = (_phase: string) => "fix-errors"; //phase === "ts" ? "ts-fix-errors" : "lint-fix-errors"

type AnyError = {
  file: string;
  line: number;
  col: number;
  message: string;
  rule?: string;
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

async function main() {
  for (let outer = 1; outer <= MAX_OUTER; outer++) {
    const tsClean = await fixPhase("ts", MAX_TS_ROUNDS);
    const lintClean = await fixPhase("lint", MAX_LINT_ROUNDS);
    const buildClean = await fixBuild(MAX_BUILD_ROUNDS);
    if (tsClean && lintClean && buildClean) {
      console.log("All clean. Done.");
      return;
    }
    console.log(
      `Outer round ${outer}: ts=${tsClean ? "clean" : "dirty"}, lint=${lintClean ? "clean" : "dirty"}, build=${buildClean ? "clean" : "dirty"}`,
    );
  }

  console.error(`Stopped after ${MAX_OUTER} outer rounds.`);
  process.exitCode = 1;
}

async function fixPhase(
  phase: "ts" | "lint",
  maxRounds: number,
): Promise<boolean> {
  for (let round = 1; round <= maxRounds; round++) {
    cleanupWorktree(getBranchName(phase));
    await using sandbox = await createSandbox({
      branch: getBranchName(phase),
      copyToWorktree: ["CLAUDE.md", ".claude/skills"],
      sandbox: docker({ imageName: ImageName }),
      // sandbox: noSandbox({ imageName: ImageName }),
      hooks: {
        sandbox: {
          onSandboxReady: [
            {
              command: "pnpm install --frozen-lockfile --force",
              timeoutMs: 300_000,
            },
          ],
        },
      },
    });

    const cwd = existsSync(`${sandbox.worktreePath}/node_modules`)
      ? sandbox.worktreePath
      : process.cwd();

    const output =
      phase === "ts" ? await runCmd(LintTS, cwd) : await runCmd(LintESFix, cwd);

    if (phase === "ts")
      console.log(`=== RAW TSC OUTPUT ===\n`, output.slice(0, 2000));
    else console.log(`=== RAW LINT OUTPUT ===\n`, output.slice(0, 2000));

    const errorsByFile =
      phase === "ts"
        ? parseTscErrors(output, sandbox.worktreePath)
        : parseLintErrors(output);

    if (errorsByFile.size === 0) {
      console.log(`[${phase}] No errors. Phase done.`);
      return true;
    }

    const leaf = findLeafFile(errorsByFile);
    const errors = errorsByFile.get(leaf)!;
    console.log(
      `\n[${phase}] Round ${round}: fixing ${leaf} (${errors.length} error(s))`,
    );

    const result = await sandbox.run({
      agent: claudeCode("us.anthropic.claude-sonnet-4-6", { effort: "medium" }),
      name: `${phase}-fix`,
      maxIterations: 5,
      completionSignal: "<promise>COMPLETE</promise>",
      prompt:
        phase === "ts"
          ? createTsPrompt(leaf, errors)
          : createLintPrompt(leaf, errors),
      logging: { type: "file", path: getLogName(phase) },
    });

    if (!result.commits.length) {
      console.log(`[${phase}] no new commits — may already be done.`);
    }
  }

  console.error(`[${phase}] Stopped after ${maxRounds} rounds.`);
  return false;
}

async function fixBuild(maxRounds: number): Promise<boolean> {
  for (let round = 1; round <= maxRounds; round++) {
    cleanupWorktree(getBranchName("build"));
    await using sandbox = await createSandbox({
      branch: getBranchName("build"),
      copyToWorktree: ["CLAUDE.md", ".claude/skills"],
      sandbox: docker({ imageName: ImageName }),
      // sandbox: noSandbox({ imageName: ImageName }),
      hooks: {
        sandbox: {
          onSandboxReady: [
            {
              command: "pnpm install --frozen-lockfile --force",
              timeoutMs: 300_000,
            },
          ],
        },
      },
    });

    const cwd = existsSync(`${sandbox.worktreePath}/node_modules`)
      ? sandbox.worktreePath
      : process.cwd();

    const { output, exitCode } = await runCmdRaw(BuildCmd, cwd);
    console.log(`=== RAW BUILD OUTPUT ===\n`, output.slice(0, 2000));

    if (exitCode === 0) {
      console.log(`[build] No errors. Phase done.`);
      return true;
    }

    console.log(
      `\n[build] Round ${round}: build failed, sending output to fix`,
    );

    const result = await sandbox.run({
      agent: claudeCode("us.anthropic.claude-sonnet-4-6", { effort: "medium" }),
      name: `build-fix`,
      maxIterations: 10,
      completionSignal: "<promise>COMPLETE</promise>",
      prompt: createBuildPrompt(output),
      logging: { type: "file", path: getLogName("build") },
    });

    if (!result.commits.length) {
      console.log(`[build] no new commits — may already be done.`);
    }
  }

  console.error(`[build] Stopped after ${maxRounds} rounds.`);
  return false;
}

async function runCmd(cmd: string, cwd: string): Promise<string> {
  return new Promise((res) => {
    execFile(
      "sh",
      ["-c", `${cmd} 2>&1 || true`],
      { cwd, maxBuffer: 10 * 1024 * 1024 },
      (_err: Error | null, stdout: string) => res(stdout),
    );
  });
}

async function runCmdRaw(
  cmd: string,
  cwd: string,
): Promise<{ output: string; exitCode: number }> {
  return new Promise((res) => {
    execFile(
      "sh",
      ["-c", `${cmd} 2>&1`],
      { cwd, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout: string) =>
        res({
          output: stdout,
          exitCode: typeof err?.code === "number" ? err.code : err ? 1 : 0,
        }),
    );
  });
}

function cleanupWorktree(branch: string): void {
  const dir = `.sandcastle/worktrees/${branch}`;
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  // prune stale worktree refs, then delete orphaned branch so sandcastle can re-create
  execFile("git", ["worktree", "prune"], { cwd: process.cwd() }, () => {
    execFile("git", ["branch", "-D", branch], { cwd: process.cwd() }, () => {});
  });
}

function parseTscErrors(output: string, cwd: string): Map<string, AnyError[]> {
  const re = /^(.+\.tsx?)\((\d+),(\d+)\): error (TS\d+: .+)$/gm;
  const map = new Map<string, AnyError[]>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(output)) !== null) {
    const file = resolve(cwd, m[1]!);
    const list = map.get(file) ?? [];
    list.push({ file, line: Number(m[2]), col: Number(m[3]), message: m[4]! });
    map.set(file, list);
  }
  return map;
}

function parseLintErrors(output: string): Map<string, AnyError[]> {
  const map = new Map<string, AnyError[]>();
  let currentFile = "";
  let pending: AnyError | null = null;
  for (const line of output.split("\n")) {
    const fileLine = line.match(/^(\/[^\s].+\.[cm]?tsx?)$/);
    if (fileLine) {
      currentFile = fileLine[1]!;
      pending = null;
      continue;
    }
    if (!currentFile) continue;
    // error line — rule may be inline or follow later
    const errLine =
      line.match(
        /^\s+(\d+):(\d+)\s+(?:error|warning)\s+(.+\S)\s{2,}(\S+)\s*$/,
      ) ?? line.match(/^\s+(\d+):(\d+)\s+(?:error|warning)\s+(.+)/);
    if (errLine) {
      const entry: AnyError = {
        file: currentFile,
        line: Number(errLine[1]),
        col: Number(errLine[2]),
        message: errLine[3]!,
        rule: errLine[4],
      };
      const list = map.get(currentFile) ?? [];
      list.push(entry);
      map.set(currentFile, list);
      // ponytail: track pending only when rule was missing (multi-line error format)
      pending = errLine[4] ? null : entry;
      continue;
    }
    // rule-only line emitted after code-context block (e.g. "  react-hooks/todo")
    if (pending) {
      const ruleOnly = line.match(/^\s+(\S+\/\S+)\s*$/);
      if (ruleOnly) {
        pending.rule = ruleOnly[1]!;
        pending = null;
      }
    }
  }
  return map;
}

function findLeafFile(errorsByFile: Map<string, AnyError[]>): string {
  const errorFiles = new Set(errorsByFile.keys());
  const imported = new Set<string>();
  for (const file of errorFiles) {
    let content = "";
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const importRe = /(?:from|import|require)\s*\(?['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content)) !== null) {
      const spec = m[1];
      if (!spec || !spec.startsWith(".")) continue;
      for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        const resolved = resolve(dirname(file), spec + ext);
        if (errorFiles.has(resolved)) {
          imported.add(resolved);
          break;
        }
      }
    }
  }
  for (const file of errorFiles) if (!imported.has(file)) return file;
  return errorFiles.values().next().value as string;
}

function createTsPrompt(file: string, errors: AnyError[]): string {
  const errorList = errors
    .map((e) => `  Line ${e.line}, Col ${e.col}: ${e.message}`)
    .join("\n");
  console.log(`FILE => ${file}\nERRORS => ${errorList}`);
  return `Fix TypeScript errors in a single file.
Use skill /ponytail:ponytail

Only disable/ignore the error as a last resort. If you have to, use \`@ts-expect-error <reason>\` instead.

File: ${file}

TypeScript errors to fix:
${errorList}

Use \`--no-verify\` for git commit

Last step: **Commit** — single commit. ALL changed files. Message format:
   \`fix(<scope>): ts errors in {{FILE}}\`

When committed, output:

<promise>COMPLETE</promise>
`;
}

function createBuildPrompt(output: string): string {
  return `Use skill /ponytail:ponytail
Fix the build failure. The build command \`${BuildCmd}\` failed with this output:

\`\`\`
${output.slice(0, 8000)}
\`\`\`

Fix the errors in the relevant files. Do NOT run the build.

Use \`--no-verify\` for git commit

Last step: **Commit** — single commit. ALL changed files. Message format:
   \`fix(build): build errors\`

When committed, output:

<promise>COMPLETE</promise>
`;
}

function createLintPrompt(file: string, errors: AnyError[]): string {
  const errorList = errors
    .map((e) => `  Line ${e.line}, Col ${e.col}: [${e.rule}] ${e.message}`)
    .join("\n");
  console.log(`FILE => ${file}\nERRORS => ${errorList}`);
  return `Use skill /ponytail:ponytail
Only disable the rule as a last resort

Fix ESLint errors in a single file.
Do NOT run eslint — edit the file manually to resolve each error.

Do not use \`eslint-disable sonarjs/cognitive-complexity\` re-write function to make simpler without breaking functionality

File: ${file}

Lint errors to fix:
${errorList}

Use \`--no-verify\` for git commit

Last step: **Commit** — single commit. ALL changed files. Message format:
   \`fix(<scope>): lint errors in {{FILE}}\`

When committed, output:

<promise>COMPLETE</promise>
`;
}
