import { config as defaultConfig } from "@gingacodemonkey/config/eslint";
import type { Linter } from "eslint";

const config: Array<Linter.Config> = [
  ...defaultConfig,
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
