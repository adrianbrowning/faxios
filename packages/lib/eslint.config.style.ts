import { config as defaultConfig } from "@gingacodemonkey/config/styled";
import type { Linter } from "eslint";

const config: Array<Linter.Config> = [ ...defaultConfig ];

export default config;
