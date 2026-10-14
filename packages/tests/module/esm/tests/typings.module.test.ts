import { describe, expect, it } from "vitest";
import { cleanupTempFixture, createTempFixture } from "./helpers/fixture.js";
import { runCommand } from "./helpers/run-command.js";
import { suiteRoot, typingFixtures } from "./helpers/typing-fixtures.js";

describe("module esm typings compatibility", () => {
  for (const { name, title, source, tsc, tsconfig } of typingFixtures) {
    it(title, () => {
      const fixturePath = createTempFixture(suiteRoot, `typings-${name}`, source, tsconfig, { type: "module" });

      try {
        // runCommand throws, with tsc's output, when the compile reports an error.
        const { stdout } = runCommand("node", [ tsc, "--noEmit", "-p", "tsconfig.json" ], { cwd: fixturePath });
        expect(stdout).toBe("");
      }
      finally {
        cleanupTempFixture(fixturePath);
      }
    });
  }
});
