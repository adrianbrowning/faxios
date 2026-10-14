// The helper files the module suite compiles in temp dirs (as index.ts, against the installed
// package), each with the tsconfig and TypeScript it is compiled with. typings.module.test.ts and
// ts.module.test.ts compile them; `scripts/check-expect-error.ts --module` checks the codes of
// their `@ts-expect-error` directives under the same settings. Only node builtins here: lint:ts
// imports this before module/esm is installed.
import fs from "node:fs";
import path from "node:path";

const helpersDir = import.meta.dirname;
export const suiteRoot = path.resolve(helpersDir, "../..");
export const tscBin = path.join(suiteRoot, "node_modules", "typescript", "bin", "tsc");
// The oldest TypeScript the shipped declarations support (they use NoInfer, added in 5.4). Keep in
// step with the floor stated in the docs (getting-started/examples/typescript.md, advanced/type-script.md).
export const floorTscBin = path.join(suiteRoot, "node_modules", "typescript-5.4", "bin", "tsc");

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

// Emits index.js, which ts.module.test.ts then runs.
const emitTsconfig = {
  compilerOptions: {
    target: "es2022",
    module: "nodenext",
    moduleResolution: "nodenext",
    strict: true,
    skipLibCheck: true,
    types: [ "node" ],
  },
};

export type TypingFixture = {
  // temp dir name part, unique per fixture
  name: string;
  source: string;
  title: string;
  tsc: string;
  tsconfig: object;
};

const helper = (file: string): string => path.join(helpersDir, file);

// A fixture that carries its own tsconfig.json next to index.ts: a consumer setup the shared
// configs above don't cover.
const ownConfig = (dir: string, title: string): TypingFixture => ({
  name: dir,
  title,
  source: helper(`${dir}/index.ts`),
  tsc: tscBin,
  tsconfig: JSON.parse(fs.readFileSync(helper(`${dir}/tsconfig.json`), "utf8")) as object,
});

// Compiled by typings.module.test.ts, one test each.
export const typingFixtures: Array<TypingFixture> = [
  { name: "esm", title: "type-checks esm faxios typings", source: helper("esm-index.ts"), tsc: tscBin, tsconfig: strictTsconfig },
  { name: "generics", title: "enforces <T,D> generics, typed headers, and no instance index signature", source: helper("generics-index.ts"), tsc: tscBin, tsconfig: strictTsconfig },
  { name: "middleware", title: "type-checks the packaged middleware and plugin API strictly", source: helper("middleware-index.ts"), tsc: tscBin, tsconfig: strictTsconfig },
  { name: "export-surface", title: "exports every public config and API type and types toFormData and URL inputs", source: helper("export-surface.ts"), tsc: tscBin, tsconfig: floorTsconfig },
  ...[ "generics-index.ts", "middleware-index.ts", "export-surface.ts" ].map((file): TypingFixture => ({
    name: "ts-floor",
    title: `type-checks ${file} against the shipped declarations with TypeScript 5.4`,
    source: helper(file),
    tsc: floorTscBin,
    tsconfig: floorTsconfig,
  })),
  ownConfig("node-only", "type-checks the shipped declarations for a Node-only consumer without the DOM lib"),
  ownConfig("exact-optional", "accepts undefined optionals under exactOptionalPropertyTypes"),
];

// Compiled to index.js and run by ts.module.test.ts.
export const functionsFixture: TypingFixture = {
  name: "ts",
  title: "compiles and executes import faxios syntax",
  source: helper("esm-functions.ts"),
  tsc: tscBin,
  tsconfig: emitTsconfig,
};
