import { config as defaultConfig } from "@gingacodemonkey/config/eslint";
import type { Linter } from "eslint";
import tseslint from "typescript-eslint";
import removeSignalListeners from "./eslint-rules/remove-signal-listeners.ts";

// AGENTS.md: remove every abort listener on settlement or cancellation.
// Shared with eslint.config.style.ts, which CI runs.
export const localRules: Array<Linter.Config> = [
  {
    files: [ "src/**/*.ts" ],
    plugins: {
      faxios: { rules: { "remove-signal-listeners": removeSignalListeners } },
    },
    rules: {
      "faxios/remove-signal-listeners": "error",
    },
  },
];

const config: Array<Linter.Config> = [
  ...defaultConfig,
  ...localRules,

  {
    files: [ "**/*.js", "**/*.cjs", "**/*.mjs" ],
    rules: {
      "big-o/no-array-lookup-in-loop": "off",
      "big-o/no-quadratic-dedup": "off",
      "big-o/no-nested-array-spread": "off",
    },
  },
  {
    rules: {
      "@typescript-eslint/promise-function-async": "off",
      "require-await": "off",
    },
  },
  {
    files: [ "**/*.ts", "**/*.cts", "**/*.mts" ],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/require-await": "error",
    },
  },
];

export default config;
