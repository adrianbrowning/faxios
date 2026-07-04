import { config as defaultConfig } from "@gingacodemonkey/config/styled";
import type { Linter } from "eslint";
import { extraRules } from "./eslint.config.ts";

const config: Array<Linter.Config> = [
  ...defaultConfig,
  ...extraRules,
  {
    files: [ "**/*.js", "**/*.cjs", "**/*.mjs" ],
    rules: {
      "big-o/no-array-lookup-in-loop": "off",
      "big-o/no-quadratic-dedup": "off",
      "big-o/no-nested-array-spread": "off",
    },
  },
];

export default config;
