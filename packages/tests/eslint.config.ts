import type { Linter } from "eslint";
import tseslint from "typescript-eslint";
import sharedConfig from "../../sharedConfig/eslint.config.ts";
import noFixedTestPort from "./eslint-rules/no-fixed-test-port.ts";
import testServerCleanup from "./eslint-rules/test-server-cleanup.ts";

const faxiosPlugin = { rules: { "no-fixed-test-port": noFixedTestPort, "test-server-cleanup": testServerCleanup } };

// The smoke (esm, deno, bun) and module (esm) harnesses install the packed tarball into their own
// node_modules, so the main tsconfig excludes them and typed linting can't resolve their `faxios`
// imports.
const EXTERNAL_TS_FILES = [ "smoke/**/*.ts", "module/**/*.ts" ];

// Fixture sources the module and Deno suites compile with tsc or `deno check` to exercise the
// public API types. They aren't Vitest tests and intentionally contain unused vars, `any`, etc.
// The `*.module.test.ts` files and the helpers they import are runnable tests and get the normal rules.
const TYPING_FIXTURE_FILES = [
  "module/esm/tests/helpers/esm-functions.ts",
  "module/esm/tests/helpers/esm-index.ts",
  "module/esm/tests/helpers/export-surface.ts",
  "module/esm/tests/helpers/exact-optional/*.ts",
  "module/esm/tests/helpers/generics-index.ts",
  "module/esm/tests/helpers/middleware-index.ts",
  "module/esm/tests/helpers/node-only/*.ts",
  "smoke/deno/types/**/*.ts",
];

export const extraRules: Array<Linter.Config> = [
  // Blocks extracted from markdown by docs-examples/extract.ts, and the tarball `deno task install` unpacks
  { ignores: [ "docs-examples/.generated*/**", "smoke/deno/.faxios/**" ] },
  // Files outside the tsconfig project: turn off projectService and the rules that need type information
  {
    files: EXTERNAL_TS_FILES,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      // Rules that require type information can't run without projectService
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
      "@typescript-eslint/no-deprecated": "off",
      "@typescript-eslint/promise-function-async": "off",
    },
  },
  // Typing fixtures: they exist only to exercise the public API types
  {
    files: TYPING_FIXTURE_FILES,
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "sonarjs/no-unused-vars": "off",
      "sonarjs/no-dead-store": "off",
      "sonarjs/no-identical-functions": "off",
      "promise/no-promise-in-callback": "off",
      "promise/catch-or-return": "off",
      "promise/always-return": "off",
      "promise/no-return-wrap": "off",
      // No Vitest `test()` calls to hold assertions
      "sonarjs/assertions-in-tests": "off",
      "vitest/expect-expect": "off",
    },
  },
  // Deno tests register with `Deno.test`, which sonarjs doesn't count as a test
  {
    files: [ "smoke/deno/tests/**/*.ts" ],
    rules: {
      "sonarjs/no-empty-test-file": "off",
    },
  },
  // Test files: disable security/style rules that are intentionally violated
  {
    files: [ "**/*.ts", "**/*.tsx" ],
    rules: {
      // sonarjs doesn't recognise `using _x = ...` (TC39 explicit resource management)
      // as a consumed variable; the dispose side-effect is the point.
      "sonarjs/no-unused-vars": "off",
      // Test fixtures legitimately use http:// and hardcoded credentials/IPs
      "sonarjs/no-hardcoded-passwords": "off",
      "sonarjs/no-clear-text-protocols": "off",
      "sonarjs/no-hardcoded-ip": "off",
      "sonarjs/publicly-writable-directories": "off",
      // Test infrastructure intentionally uses body-parser
      "depend/ban-dependencies": "off",
      // Tests intentionally use Math.random for seeding/fuzzing
      "sonarjs/pseudo-random": "off",
      // Tests check deprecated APIs on purpose
      "sonarjs/deprecation": "off",
      "@typescript-eslint/no-deprecated": "off",
      // x-powered-by header intentionally set in test server
      "sonarjs/x-powered-by": "off",
      "sonarjs/no-empty-group": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "sonarjs/no-ignored-exceptions": "off",
      "@typescript-eslint/no-explicit-any": "off",
      // Test callbacks often return async functions where void is expected
      "@typescript-eslint/no-misused-promises": "off",
      // TS infers always-truthy/falsy in test assertions; these are runtime guards
      "@typescript-eslint/no-unnecessary-condition": "off",
      // Catch variables in tests don't need unknown narrowing
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
      // Tests pass undefined intentionally
      "sonarjs/no-undefined-argument": "off",
      // Test fixtures intentionally overwrite map entries
      "sonarjs/no-element-overwrite": "off",
      // Test server file-upload and content-length configs are intentional
      "sonarjs/content-length": "off",
      "sonarjs/file-uploads": "off",
      // Test logic intentionally sorts/reverses
      "sonarjs/no-misleading-array-reverse": "off",
      "sonarjs/no-alphabetical-sort": "off",
      // Inline union types are fine in test files
      "sonarjs/use-type-alias": "off",
      // Identical handler functions are intentional test fixtures
      "sonarjs/no-identical-functions": "off",
      // Minor style preference not worth enforcing in tests
      "sonarjs/prefer-regexp-exec": "off",
      // Test transformers legitimately reassign the value parameter
      "sonarjs/no-parameter-reassignment": "off",
      // Some tests assert via thrown errors or helper functions; vitest/expect-expect (below) covers this
      "sonarjs/assertions-in-tests": "off",
      // Nested describe blocks in parameterised tests
      "vitest/max-nested-describe": "off",
      // Dynamic test titles from test-case objects
      "vitest/valid-title": "off",
      // Promise chains in test infrastructure don't need strict return discipline
      "promise/always-return": "off",
      // Test Promise constructors use short param names (r, done, etc.)
      "promise/param-names": "off",
      // Regex in tests doesn't need ReDoS-safe rewrites
      "sonarjs/slow-regex": "off",
      "sonarjs/single-char-in-character-classes": "off",
      // Test infrastructure intentionally throttles stream output
      "no-await-in-loop": "off",
      // Tests use .toBe(null) / .toBe(undefined) intentionally
      "sonarjs/prefer-specific-assertions": "off",
    },
  },
  // Every test (smoke files included) must assert, and not only inside a branch: a test whose
  // assertions sit in `catch` or `if` passes when the request resolves. `assert*` covers
  // node:assert, Deno's assertEquals and local assertX helpers; expectTypeOf/assertType are
  // Vitest's type assertions, checked by `lint:ts`.
  {
    files: [ "**/*.test.ts", "**/*.test.tsx" ],
    rules: {
      "vitest/expect-expect": [ "error", {
        assertFunctionNames: [ "expect", "assert", "assert.*", "assertEquals", "assert*", "testHeaderValue", "expectTypeOf", "assertType" ],
      }],
      "vitest/no-conditional-expect": "error",
    },
  },
  // Every file here: test servers bind port 0, so parallel runs (other worktrees, agents)
  // don't collide; and nothing patches built-in prototypes except the listed pollution tests.
  {
    plugins: { faxios: faxiosPlugin },
    rules: {
      "faxios/no-fixed-test-port": "error",
      "no-extend-native": "error",
    },
  },
  // AGENTS.md: stop every test server in `finally` or afterEach/afterAll.
  {
    files: [ "**/*.test.ts", "**/*.test.js" ],
    plugins: { faxios: faxiosPlugin },
    rules: {
      "faxios/test-server-cleanup": "error",
    },
  },
  {
    files: [ "**/*.js", "**/*.cjs", "**/*.mjs" ],
    rules: {
      "big-o/no-array-lookup-in-loop": "off",
      "big-o/no-quadratic-dedup": "off",
      "big-o/no-nested-array-spread": "off",
    },
  },
  // Tests import lib internals through `#src/*` (tsconfig paths -> ../lib/src/*) on purpose.
  { rules: { "gingacodemonkey/workspace-boundaries": "off" } },
];

const config: Array<Linter.Config> = [
  ...sharedConfig,
  ...extraRules,
];

export default config;
