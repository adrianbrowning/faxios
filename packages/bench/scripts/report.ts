// Writes packages/docs/pages/misc/comparison.md (see render.ts). The page is generated: change the
// renderer or the fixtures, then run `pnpm bench` from the repository root.
// Usage: node scripts/report.ts
import { writeFileSync } from "node:fs";
import { page } from "./render.ts";

writeFileSync(new URL("../../docs/pages/misc/comparison.md", import.meta.url), page);
console.log("wrote packages/docs/pages/misc/comparison.md");
