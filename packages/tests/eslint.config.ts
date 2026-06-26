import { config as defaultConfig } from "@gingacodemonkey/config/eslint";
import type { Linter } from "eslint";
import tseslint from "typescript-eslint";

// Files that live outside the main tsconfig and can't be added to it
// (they run in different runtime environments: bun, deno, node-cjs)
const EXTERNAL_TS_FILES = [ "smoke/**/*.ts", "module/**/*.ts" ];

// Type-checking exercise files (esm-index.ts, cjs-typing.ts, etc.)
// These files exist purely to exercise the public API types; they are not
// runnable programs and intentionally contain unused vars, any types, etc.
const MODULE_TYPING_FILES = [ "module/**/*.ts" ];

export const extraRules: Array<Linter.Config> = [
  // For files outside the tsconfig project, disable projectService-based linting
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
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "sonarjs/no-unused-vars": "off",
      "sonarjs/no-dead-store": "off",
      "sonarjs/no-empty-test-file": "off",
      "promise/catch-or-return": "off",
      "promise/always-return": "off",
      "promise/no-return-wrap": "off",
      "promise/no-promise-in-callback": "off",
      // "unicorn/prefer-node-protocol": "off",
      "sonarjs/no-identical-functions": "off",
      "vitest/no-conditional-expect": "off",
    },
  },
  // Module typing test files: they exist purely to exercise the public API types
  {
    files: MODULE_TYPING_FILES,
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
      "sonarjs/no-unused-vars": "off",
      "sonarjs/no-dead-store": "off",
      "sonarjs/no-identical-functions": "off",
      "promise/no-promise-in-callback": "off",
      "promise/catch-or-return": "off",
      "promise/always-return": "off",
      "promise/no-return-wrap": "off",
      // Assertions-only tests / vitest expect-expect
      "sonarjs/assertions-in-tests": "off",
      "vitest/expect-expect": "off",
    },
  },
  // Tests that use helper functions containing assertions
  {
    files: [
      "browser/headers.browser.test.ts",
      "unit/axios.test.ts",
    ],
    rules: {
      "vitest/expect-expect": [
        "error",
        { assertFunctionNames: [ "expect", "testHeaderValue", "assert.*" ] },
      ],
      "vitest/no-conditional-expect": "off",
    },
  },
  // Test files: disable security/style rules that are intentionally violated
  {
    files: [ "**/*.ts", "**/*.tsx" ],
    rules: {
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
      "vitest/no-conditional-expect": "off",
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
      // Some tests assert via thrown errors or helper functions
      "sonarjs/assertions-in-tests": "off",
      "vitest/expect-expect": "off",
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
    },
  },
];

const config: Array<Linter.Config> = [ ...defaultConfig, ...extraRules ];

export default config;
