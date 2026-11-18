import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = resolve(import.meta.dirname, "../../scripts/check-workflow-timeouts.ts");
const repoWorkflows = resolve(import.meta.dirname, "../../../../.github/workflows");

const job = (id: string, settings: string) => `  ${id}:\n${settings}    steps:\n      - run: echo ok\n`;
const workflow = (...jobs: Array<string>) => `name: ci\non: push\njobs:\n${jobs.join("")}`;

// Each case starts a Node process. Under the full parallel `pnpm run test` one start took over 6 s,
// past the unit project's 5 s default timeout. A hung run is killed after 20 s, inside the 30 s test
// timeout, so the case fails with `status: null` and leaves no process behind.
describe("scripts/check-workflow-timeouts.ts", { timeout: 30_000 }, () => {
  let dir: string;
  const check = async (workflowsDir = dir) => {
    const child = spawn(process.execPath, [ script, workflowsDir ], { stdio: [ "ignore", "ignore", "pipe" ], timeout: 20_000 });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    await once(child, "close");
    return { status: child.exitCode, stderr };
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "faxios-timeouts-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails and names the file and job when a runs-on job has no timeout-minutes", async () => {
    writeFileSync(join(dir, "ci.yml"), workflow(
      job("build", "    runs-on: ubuntu-latest\n    timeout-minutes: 10\n"),
      job("test", "    runs-on: ubuntu-latest\n")
    ));

    const result = await check();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("ci.yml");
    expect(result.stderr).toContain("job `test` has no timeout-minutes");
    expect(result.stderr).not.toContain("`build`");
  });

  it.each([ "0", "61", "1.5", "${{ inputs.minutes }}" ])("fails for timeout-minutes: %s", async minutes => {
    writeFileSync(join(dir, "ci.yaml"), workflow(job("test", `    runs-on: ubuntu-latest\n    timeout-minutes: ${minutes}\n`)));

    const result = await check();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("ci.yaml");
    expect(result.stderr).toContain("job `test` sets timeout-minutes");
  });

  it("passes when every runs-on job sets a timeout from 1 to 60", async () => {
    writeFileSync(join(dir, "ci.yml"), workflow(
      job("build", "    runs-on: ubuntu-latest\n    timeout-minutes: 1 # quick\n"),
      job("test", "    timeout-minutes: 60\n    runs-on: ubuntu-latest\n")
    ));

    const result = await check();

    expect(result).toMatchObject({ status: 0 });
  });

  it("passes a job that calls a reusable workflow without timeout-minutes", async () => {
    writeFileSync(join(dir, "release.yml"), `name: release\non: push\njobs:\n  ci:\n    uses: ./.github/workflows/run-ci.yml\n`);

    const result = await check();

    expect(result).toMatchObject({ status: 0 });
  });

  it("passes on the repository's own workflows", async () => {
    const result = await check(repoWorkflows);

    expect(result).toMatchObject({ status: 0 });
  });
});
