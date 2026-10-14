import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { cleanupTempFixture, createTempFixture } from "./helpers/fixture.js";
import { runCommand } from "./helpers/run-command.js";

const suiteRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const repoRoot = path.resolve(suiteRoot, "../../..");
const tscBin = path.join(suiteRoot, "node_modules", "typescript", "bin", "tsc");
// The oldest TypeScript the shipped declarations support (they use NoInfer, added in 5.4). Keep in
// step with the floor stated in the docs (getting-started/examples/typescript.md, advanced/type-script.md).
const floorTscBin = path.join(suiteRoot, "node_modules", "typescript-5.4", "bin", "tsc");

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

// skipLibCheck stays off so the faxios declarations themselves are checked. `types: []` keeps
// @types/node out: its own declarations follow newer TypeScript releases, not faxios's floor.
const floorTsconfig = {
  compilerOptions: {
    ...strictTsconfig.compilerOptions,
    target: "es2022",
    lib: [ "es2023", "dom", "dom.iterable" ],
    types: [],
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

  it("type-checks the packaged middleware and plugin API strictly", () => {
    const sourcePath = path.join(
      repoRoot,
      "tests/module/esm/tests/helpers/middleware-index.ts"
    );
    const fixturePath = createTempFixture(
      suiteRoot,
      "typings-middleware",
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

  it("exports every public config and API type and types toFormData and URL inputs", () => {
    const sourcePath = path.join(
      repoRoot,
      "tests/module/esm/tests/helpers/export-surface.ts"
    );
    const fixturePath = createTempFixture(
      suiteRoot,
      "typings-export-surface",
      sourcePath,
      floorTsconfig,
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

  for (const helper of [ "generics-index.ts", "middleware-index.ts", "export-surface.ts" ]) {
    it(`type-checks ${helper} against the shipped declarations with TypeScript 5.4`, () => {
      const sourcePath = path.join(repoRoot, "tests/module/esm/tests/helpers", helper);
      const fixturePath = createTempFixture(
        suiteRoot,
        "typings-ts-floor",
        sourcePath,
        floorTsconfig,
        {
          type: "module",
        }
      );

      try {
        runCommand("node", [ floorTscBin, "--noEmit", "-p", "tsconfig.json" ], {
          cwd: fixturePath,
        });
      }
      finally {
        cleanupTempFixture(fixturePath);
      }
    });
  }
});
