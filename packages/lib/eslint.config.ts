import type { Linter } from "eslint";
import tseslint from "typescript-eslint";
import sharedConfig from "../../sharedConfig/eslint.config.ts";
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
  // CODING_STANDARDS: built-in plugins use only what a third-party plugin can import without the
  // root default instance (`@gcmdev/faxios/core`, `/schema` and `/form`), plus each other.
  // definePlugin.ts is the `@gcmdev/faxios/plugins` entry point.
  {
    files: [ "src/lib/plugins/**/*.ts" ],
    rules: {
      "no-restricted-imports": [ "error", {
        patterns: [{
          regex: "^(?!\\.\\./\\.\\./(?:core|form|schema)\\.js$|\\./[^/]+\\.js$)",
          message: "Built-in plugins import only @gcmdev/faxios/core, /schema or /form (\"../../core.js\", \"../../schema.js\", \"../../form.js\") and files in plugins/; the package root would load the default instance.",
        }],
      }],
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

const config: Array<Linter.Config> = [
  ...sharedConfig,
  ...localRules,
];

export default config;
