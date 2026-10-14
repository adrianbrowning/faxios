// A GitHub Actions job without `timeout-minutes` runs for up to 360 minutes. A hung release gate
// then holds its concurrency group (release.yml, the `pages` group in docs.yml) for six hours, and
// a hung AI moderator run burns model quota. This check fails when a job that runs on a runner
// (`runs-on`) has no `timeout-minutes`, or one outside 1-60. Jobs that call a reusable workflow
// (`uses:`) cannot set it; the called workflow's own jobs are checked instead. Part of `lint:ts`.
// `node scripts/check-workflow-timeouts.ts <dir>` checks another workflows directory.
// The workflows use two-space indentation, so a job is a two-space key under the top-level `jobs:`
// and its settings are four-space keys; zizmor parses them properly in CI.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const MAX_MINUTES = 60;
const repoRoot = resolve(import.meta.dirname, "../../..");
const workflowsDir = resolve(process.argv[2] ?? join(repoRoot, ".github/workflows"));
const problems: Array<string> = [];

type Job = { id: string; line: number; runsOn: boolean; timeout: string | undefined; };

function jobsOf(source: string): Array<Job> {
  const jobs: Array<Job> = [];
  let inJobs = false;
  let job: Job | undefined;
  for (const [ index, line ] of source.split("\n").entries()) {
    if (/^\S/.test(line) && !line.startsWith("#")) {
      inJobs = /^jobs:\s*(?:#.*)?$/.test(line);
      job = undefined;
      continue;
    }
    if (!inJobs) continue;
    const id = /^ {2}([\w-]+):\s*(?:#.*)?$/.exec(line)?.[1];
    if (id !== undefined) {
      job = { id, line: index + 1, runsOn: false, timeout: undefined };
      jobs.push(job);
      continue;
    }
    if (job === undefined) continue;
    if (/^ {4}runs-on:/.test(line)) job.runsOn = true;
    const timeout = /^ {4}timeout-minutes:(.*)$/.exec(line)?.[1];
    if (timeout !== undefined) job.timeout = timeout.replace(/#.*/, "").trim();
  }
  return jobs;
}

for (const name of readdirSync(workflowsDir).toSorted()) {
  if (!/\.ya?ml$/.test(name)) continue;
  const path = join(workflowsDir, name);
  const file = path.startsWith(repoRoot) ? relative(repoRoot, path) : path;
  for (const job of jobsOf(readFileSync(path, "utf8"))) {
    if (!job.runsOn) continue;
    if (job.timeout === undefined) {
      problems.push(`${file}:${job.line} job \`${job.id}\` has no timeout-minutes`);
      continue;
    }
    const minutes = Number(job.timeout);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
      problems.push(`${file}:${job.line} job \`${job.id}\` sets timeout-minutes: ${job.timeout}; use a whole number from 1 to ${MAX_MINUTES}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Workflow timeout check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
