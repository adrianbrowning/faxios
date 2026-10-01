import { config as defaultConfig } from "@gingacodemonkey/config/styled";
import type { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { localRules } from "./eslint.config.ts";

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
