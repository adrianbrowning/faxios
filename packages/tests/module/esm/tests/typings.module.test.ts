import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { createTempFixture, cleanupTempFixture } from "./helpers/fixture.js";
import { runCommand } from "./helpers/run-command.js";

const suiteRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const repoRoot = path.resolve(suiteRoot, "../../..");
const tscBin = path.join(suiteRoot, "node_modules", "typescript", "bin", "tsc");

const tsconfig = {
  compilerOptions: {
    checkJs: true,
    module: "node16",
  },
};

const strictTsconfig = {
  compilerOptions: {
    module: "node16",
    moduleResolution: "node16",
    strict: true,
    skipLibCheck: false,
    noEmit: true,
  },
};

describe("module esm typings compatibility", () => {
  it("type-checks esm faxios typings", () => {
    const sourcePath = path.join(
      repoRoot,
      "tests/module/esm/tests/helpers/esm-index.ts"
    );
    const fixturePath = createTempFixture(
      suiteRoot,
      "typings-esm",
      sourcePath,
      tsconfig,
      {
        type: "module",
      }
    );

    try {
      runCommand("node", [ tscBin, "--noEmit", "-p", "tsconfig.json" ], {
        cwd: fixturePath,
      });
    }
    finally {
      cleanupTempFixture(fixturePath);
    }
  });

  it("enforces <T,R,D> generics, typed headers, and no instance index signature", () => {
    const sourcePath = path.join(
      repoRoot,
      "tests/module/esm/tests/helpers/generics-index.ts"
    );
    const fixturePath = createTempFixture(
      suiteRoot,
      "typings-generics",
      sourcePath,
      strictTsconfig,
      {
        type: "module",
      }
    );

    try {
      runCommand("node", [ tscBin, "--noEmit", "-p", "tsconfig.json" ], {
        cwd: fixturePath,
      });
    }
    finally {
      cleanupTempFixture(fixturePath);
    }
  });
});
