import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = resolve(import.meta.dirname, "../../scripts/check-workflow-timeouts.ts");
const repoWorkflows = resolve(import.meta.dirname, "../../../../.github/workflows");

const job = (id: string, settings: string) => `  ${id}:\n${settings}    steps:\n      - run: echo ok\n`;
const workflow = (...jobs: Array<string>) => `name: ci\non: push\njobs:\n${jobs.join("")}`;

describe("scripts/check-workflow-timeouts.ts", () => {
  let dir: string;
  const check = (workflowsDir = dir) => spawnSync(process.execPath, [ script, workflowsDir ], { encoding: "utf8" });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "faxios-timeouts-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails and names the file and job when a runs-on job has no timeout-minutes", () => {
    writeFileSync(join(dir, "ci.yml"), workflow(
      job("build", "    runs-on: ubuntu-latest\n    timeout-minutes: 10\n"),
      job("test", "    runs-on: ubuntu-latest\n")
    ));

    const result = check();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("ci.yml");
    expect(result.stderr).toContain("job `test` has no timeout-minutes");
    expect(result.stderr).not.toContain("`build`");
  });

  it.each([ "0", "61", "1.5", "${{ inputs.minutes }}" ])("fails for timeout-minutes: %s", minutes => {
    writeFileSync(join(dir, "ci.yaml"), workflow(job("test", `    runs-on: ubuntu-latest\n    timeout-minutes: ${minutes}\n`)));

    const result = check();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("ci.yaml");
    expect(result.stderr).toContain("job `test` sets timeout-minutes");
  });

  it("passes when every runs-on job sets a timeout from 1 to 60", () => {
    writeFileSync(join(dir, "ci.yml"), workflow(
      job("build", "    runs-on: ubuntu-latest\n    timeout-minutes: 1 # quick\n"),
      job("test", "    timeout-minutes: 60\n    runs-on: ubuntu-latest\n")
    ));

    const result = check();

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("passes a job that calls a reusable workflow without timeout-minutes", () => {
    writeFileSync(join(dir, "release.yml"), `name: release\non: push\njobs:\n  ci:\n    uses: ./.github/workflows/run-ci.yml\n`);

    const result = check();

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("passes on the repository's own workflows", () => {
    const result = check(repoWorkflows);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
