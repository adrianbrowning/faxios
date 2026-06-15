import { config as defaultConfig } from "@gingacodemonkey/config/eslint";
import type { Linter } from "eslint";

const testFiles = [ "**/tests/**/*.{js,ts,cjs}", "**/*.test.{js,ts,cjs}", "**/eslint.config*.ts" ];

export const extraRules: Array<Linter.Config> = [
  {
    files: testFiles,
    rules: {
      // Security rules that are intentional in test fixtures
      "sonarjs/no-hardcoded-passwords": "off",
      "sonarjs/no-clear-text-protocols": "off",
      "sonarjs/no-hardcoded-ip": "off",
      "sonarjs/pseudo-random": "off",
      "sonarjs/publicly-writable-directories": "off",
      "sonarjs/content-length": "off",
      "sonarjs/file-uploads": "off",
      "sonarjs/x-powered-by": "off",
      // Test quality rules - these tests use type-check-as-assertion patterns
      "sonarjs/assertions-in-tests": "off",
      "sonarjs/no-identical-functions": "off",
      "sonarjs/no-ignored-exceptions": "off",
      "sonarjs/no-parameter-reassignment": "off",
      "sonarjs/no-dead-store": "off",
      "sonarjs/no-unused-vars": "off",
      "sonarjs/no-extra-arguments": "off",
      "sonarjs/slow-regex": "off",
      "sonarjs/single-char-in-character-classes": "off",
      "sonarjs/no-small-switch": "off",
      "sonarjs/no-element-overwrite": "off",
      "vitest/no-conditional-expect": "off",
      "vitest/expect-expect": "off",
      "vitest/max-nested-describe": "off",
      "vitest/valid-title": "off",
      "vitest/no-disabled-tests": "off",
      // Smoke tests intentionally import axios (the package under test)
      "depend/ban-dependencies": "off",
      // Promise patterns in test servers are intentional fire-and-forget
      "promise/no-promise-in-callback": "off",
      "promise/catch-or-return": "off",
      "promise/always-return": "off",
      "promise/param-names": "off",
      "no-return-await": "off",
      // Import style — test files use legacy imports pre-dating node: protocol
      "import/order": "off",
      "unicorn/prefer-node-protocol": "off",
      "@stylistic/quotes": "off",
    },
  },
  // Fixture TS files live in isolated sub-packages without a tsconfig.
  // Use allowDefaultProject so the project service can parse them, and
  // disable all type-aware rules since there is no strict tsconfig for them.
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "packages/lib/tests/module/cjs/tests/helpers/*.ts",
            "packages/lib/tests/module/esm/tests/helpers/*.ts",
            "packages/lib/tests/smoke/bun/tests/*.ts",
            "packages/lib/tests/smoke/deno/tests/*.ts",
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 30,
        },
      },
    },
  },
  {
    files: [
      "**/tests/module/cjs/tests/helpers/*.ts",
      "**/tests/module/esm/tests/helpers/*.ts",
      "**/tests/smoke/bun/tests/*.ts",
      "**/tests/smoke/deno/tests/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/promise-function-async": "off",
      "@typescript-eslint/no-deprecated": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "sonarjs/no-empty-test-file": "off",
      "promise/no-return-wrap": "off",
    },
  },
];

const config: Array<Linter.Config> = [
  ...defaultConfig,
  ...extraRules,
];

export default config;