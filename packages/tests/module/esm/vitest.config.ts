import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "module",
          environment: "node",
          // Inline projects don't inherit the root `test` options; each test spawns tsc.
          testTimeout: 60000,
          include: [ "tests/**/*.module.test.ts" ],
          setupFiles: [],
        },
      },
    ],
  },
});
