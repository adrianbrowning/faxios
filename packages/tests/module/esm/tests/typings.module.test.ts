import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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

  it("type-checks faxios/core with use(schema()) and use(form()) strictly", () => {
    const sourcePath = path.join(repoRoot, "tests/module/esm/tests/helpers/core-index.ts");
    const fixturePath = createTempFixture(suiteRoot, "typings-core", sourcePath, strictTsconfig, { type: "module" });

    try {
      runCommand("node", [ tscBin, "--noEmit", "-p", "tsconfig.json" ], { cwd: fixturePath });
    }
    finally {
      cleanupTempFixture(fixturePath);
    }
  });

  // A @ts-expect-error passes on any error, so remove each directive and check that the code it
  // names (e.g. TS2769 for responseSchema before use(schema())) is reported on the line below.
  it("reports the error each faxios/core directive names once the directive is removed", () => {
    const sourcePath = path.join(repoRoot, "tests/module/esm/tests/helpers/core-index.ts");
    const lines = fs.readFileSync(sourcePath, "utf8").split("\n");
    const expected = lines.flatMap((line, index) => {
      const code = /\/\/ @ts-expect-error (TS\d+)/.exec(line)?.[1];
      return code ? [ `index.ts(${index + 2}): ${code}` ] : [];
    });
    const fixturePath = createTempFixture(suiteRoot, "typings-core-codes", sourcePath, strictTsconfig, { type: "module" });

    try {
      fs.writeFileSync(path.join(fixturePath, "index.ts"), lines.map(line => line.replace("// @ts-expect-error", "// expected")).join("\n"));
      const result = spawnSync(process.execPath, [ tscBin, "--noEmit", "-p", "tsconfig.json" ], { cwd: fixturePath, encoding: "utf8" });
      const reported = [ ...result.stdout.matchAll(/^index\.ts\((\d+),\d+\): error (TS\d+)/gm) ].map(([ , line, code ]) => `index.ts(${line}): ${code}`);

      expect(expected).toContain("index.ts(40): TS2769");
      expect(reported).toEqual(expected);
    }
    finally {
      cleanupTempFixture(fixturePath);
    }
  });

  for (const helper of [ "generics-index.ts", "middleware-index.ts", "core-index.ts" ]) {
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
