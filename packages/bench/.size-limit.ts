// Size Limit checks for the comparison report: every entry in scripts/entries.ts, four ways.
// No check sets a limit, so the numbers are informational and never fail a run. faxios's own
// size budgets live with the library, not here.
import { ENTRIES, MEASURES } from "./scripts/entries.ts";
import type { Measure } from "./scripts/entries.ts";

type EsbuildOptions = Record<string, unknown>;

// Size Limit minifies and Brotli-compresses by default; `raw` turns minification off as well.
const MEASURE_OPTIONS: Record<Measure, { brotli?: false; gzip?: true; minify?: false; }> = {
  raw: { brotli: false, minify: false },
  minified: { brotli: false },
  gzip: { gzip: true },
  brotli: {},
};

export default ENTRIES.flatMap(entry => MEASURES.map(measure => {
  const { minify, ...compression } = MEASURE_OPTIONS[measure];
  return {
    name: `${entry.name} ${measure}`,
    path: entry.path,
    ...compression,
    // An ES module consumer bundle for browsers: exports stay, so tree-shaking keeps what a
    // consumer that imports the fixture would keep. No source maps.
    modifyEsbuildConfig: (config: EsbuildOptions): EsbuildOptions => ({
      ...config,
      format: "esm",
      platform: "browser",
      target: "es2022",
      sourcemap: false,
      ...(minify === false && { minifyIdentifiers: false, minifySyntax: false, minifyWhitespace: false }),
    }),
  };
}));
