import { defineConfig } from "vitest/config";

// Separate from vitest.config.js so `pnpm test` doesn't need the extraction step.
export default defineConfig({
  test: {
    name: "docs-examples",
    environment: "node",
    include: [ "docs-examples/*.test.ts" ],
    testTimeout: 5000,
  },
});
