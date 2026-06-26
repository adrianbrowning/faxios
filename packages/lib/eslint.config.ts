import { config as defaultConfig } from "@gingacodemonkey/config/eslint";
import type { Linter } from "eslint";

const config: Array<Linter.Config> = [ ...defaultConfig ];

export default config;
