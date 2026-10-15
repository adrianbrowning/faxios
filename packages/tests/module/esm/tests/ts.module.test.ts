import { describe, expect, it } from "vitest";
import { cleanupTempFixture, createTempFixture } from "./helpers/fixture.js";
import { runCommand } from "./helpers/run-command.js";
import { functionsFixture, suiteRoot } from "./helpers/typing-fixtures.js";

describe("module ts compatibility", () => {
  it(functionsFixture.title, () => {
    const { name, source, tsc, tsconfig } = functionsFixture;
    const fixturePath = createTempFixture(suiteRoot, name, source, tsconfig, { type: "module" });

    try {
      runCommand("node", [ tsc, "-p", "tsconfig.json" ], { cwd: fixturePath });
      // index.js asserts each function's behaviour with node:assert; a mismatch exits non-zero,
      // which runCommand throws on.
      const { stdout } = runCommand("node", [ "index.js" ], { cwd: fixturePath });
      expect(stdout).toBe("esm functions ok\n");
    }
    finally {
      cleanupTempFixture(fixturePath);
    }
  });
});
