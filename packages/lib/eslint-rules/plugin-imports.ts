// CODING_STANDARDS: built-in plugins use only what a third-party plugin can import: the package
// root's exports, plus each other. Types come from the root; runtime values come from the module
// the root re-exports them from. definePlugin.ts is the `@gcmdev/faxios/plugins` entry point.
// Its own module so unit/eslint-rules/pluginImports.test.ts can load it without the shared config.
import type { Linter } from "eslint";
import tseslint from "typescript-eslint";

// The package root's runtime exports, by the module it re-exports them from (relative to
// src/lib/plugins/). Built-in plugins import a runtime value from its module, not from the root, so
// a plugin bundle doesn't keep the default instance; they may import only these names, so they use
// nothing a third-party plugin can't. packages/tests/unit/eslint-rules/pluginImports.test.ts
// checks this list against src/index.ts.
export const rootRuntimeExports: Record<string, Array<string>> = {
  "../cancel/CanceledError.js": [ "default" ],
  "../cancel/isCancel.js": [ "default" ],
  "../core/Faxios.js": [ "default" ],
  "../core/FaxiosError.js": [ "default", "isSchemaValidationError" ],
  "../core/FaxiosHeaders.js": [ "default" ],
  "../core/mergeConfig.js": [ "default" ],
  "../core/resolveRequestURL.js": [ "default" ],
  "../create.js": [ "create" ],
  "../env/data.js": [ "VERSION" ],
  "../helpers/all.js": [ "all" ],
  "../helpers/formToJSON.js": [ "formToJSON" ],
  "../helpers/HttpStatusCode.js": [ "default" ],
  "../helpers/isFaxiosError.js": [ "default" ],
  "../helpers/toFormData.js": [ "default" ],
};

// Module specifiers a plugin may import, as regex sources: the root, files in plugins/, and the
// modules above with their regex metacharacters escaped.
const allowedModules = [
  "\\.\\./\\.\\./index\\.js",
  "\\./[^/]+\\.js",
  ...Object.keys(rootRuntimeExports).map(module => module.replaceAll(/[$()*+.?[\\\]^{|}]/g, "\\$&")),
];

export const pluginImports: Linter.Config = {
  files: [ "src/lib/plugins/**/*.ts" ],
  plugins: {
    "@typescript-eslint": tseslint.plugin,
  },
  rules: {
    "@typescript-eslint/no-restricted-imports": [ "error", {
      paths: [
        {
          name: "../../index.js",
          allowTypeImports: true,
          message: "Import runtime values from the module the package root re-exports them from, so the plugin bundle doesn't keep the default instance.",
        },
        ...Object.entries(rootRuntimeExports).map(([ name, allowImportNames ]) => ({
          name,
          allowImportNames,
          message: "Built-in plugins import from this module only what the package root re-exports from it; import types from \"../../index.js\".",
        })),
      ],
      patterns: [{
        regex: `^(?!(?:${allowedModules.join("|")})$)`,
        message: "Built-in plugins import only types from the package root (\"../../index.js\"), modules the root re-exports, and files in plugins/.",
      }],
    }],
  },
};
