import sharedConfig from "../../sharedConfig/eslint.config.style.ts";
import type { Linter } from "eslint";
import { localRules } from "./eslint.config";

const config: Array<Linter.Config> = [
    ...sharedConfig,
    ...localRules
];
export default config;
