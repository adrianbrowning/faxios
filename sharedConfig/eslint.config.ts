import type { Linter } from "eslint";
import defaultConfig from '@gingacodemonkey/config/eslint';

export const extraRules: Array<Linter.Config> = [];

const config: Array<Linter.Config> = [
  ...defaultConfig,
  ...extraRules,
];

export default config;