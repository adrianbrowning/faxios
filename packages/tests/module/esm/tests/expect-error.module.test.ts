import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommand } from "./helpers/run-command.js";
import { suiteRoot } from "./helpers/typing-fixtures.js";

describe("module esm @ts-expect-error codes", () => {
  it("names the error each @ts-expect-error expects, checked with the pinned TypeScript", () => {
    // Exits non-zero, which runCommand throws on with the script's report, when a directive has
    // no code or its code isn't reported on the line below.
    const { stderr } = runCommand("node", [ path.join(suiteRoot, "../../scripts/check-expect-error.ts"), "--module" ], { cwd: suiteRoot });
    expect(stderr).toBe("");
  });
});
