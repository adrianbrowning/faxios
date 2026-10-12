import type { Linter } from "eslint";
import sharedConfig from "../../sharedConfig/eslint.config.style.ts";

import { extraRules } from "./eslint.config.ts";

const config: Array<Linter.Config> = [
  ...sharedConfig,
  ...extraRules,
];

export default config;
