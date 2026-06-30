import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 10000,
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: [ "unit/**/*.test.{js,ts}" ],
          setupFiles: [],
          maxWorkers: 1,
          minWorkers: 1,
        },
      },
      {
        // ponytail: transpile `using` (explicit resource management) for webkit compat
        oxc: { target: "es2022" },
        test: {
          name: "browser",
          include: [ "browser/**/*.browser.test.{js,ts}" ],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
          setupFiles: [ "setup/browser.setup.ts" ],
        },
      },
      {
        // ponytail: transpile `using` (explicit resource management) for webkit compat
        oxc: { target: "es2022" },
        test: {
          name: "browser-headless",
          include: [ "browser/**/*.browser.test.{js,ts}" ],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [
              { browser: "chromium", headless: true },
              { browser: "firefox", headless: true },
              { browser: "webkit", headless: true },
            ],
          },
          setupFiles: [ "setup/browser.setup.ts" ],
        },
      },
    ],
  },
});