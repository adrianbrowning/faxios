"use strict";

import type { TransitionalOptions } from "../types.js";

// Every transitional option and its default; request validation accepts exactly these keys.
export default {
  forcedJSONParsing: true,
  validateStatusUndefinedResolves: false,
} satisfies Required<TransitionalOptions>;
