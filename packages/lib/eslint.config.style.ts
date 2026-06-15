import type { Linter } from "eslint";
import { config as defaultConfig } from '@gingacodemonkey/config/styled';
import { extraRules } from './eslint.config';

const config: Array<Linter.Config> = [
  ...defaultConfig,
  ...extraRules,
];

export default config;