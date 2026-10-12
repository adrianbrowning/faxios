import type { Linter } from "eslint";
import sharedConfig from "../../sharedConfig/eslint.config.style.ts";
import { localRules } from "./eslint.config.ts";

const config: Array<Linter.Config> = [
  ...sharedConfig,
  ...localRules,
];
export default config;
