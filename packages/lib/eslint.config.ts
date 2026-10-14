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
  // CODING_STANDARDS: built-in plugins use only what a third-party plugin can import: the package
  // root's exports, plus each other. Types come from the root; runtime values come from the module
  // the root re-exports them from, so a plugin bundle doesn't keep the default instance.
  // definePlugin.ts is the `@gcmdev/faxios/plugins` entry point.
  {
    files: [ "src/lib/plugins/**/*.ts" ],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/no-restricted-imports": [ "error", {
        paths: [{
          name: "../../index.js",
          allowTypeImports: true,
          message: "Import runtime values from the module the package root re-exports them from, so the plugin bundle doesn't keep the default instance.",
        }],
        patterns: [{
          regex: "^(?!\\.\\./\\.\\./index\\.js$|\\./[^/]+\\.js$|\\.\\./cancel/(?:CanceledError|isCancel)\\.js$|\\.\\./core/(?:FaxiosError|FaxiosHeaders|mergeConfig|resolveRequestURL)\\.js$|\\.\\./helpers/(?:HttpStatusCode|isFaxiosError|toFormData)\\.js$)",
          message: "Built-in plugins import only types from the package root (\"../../index.js\"), modules the root re-exports, and files in plugins/.",
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
