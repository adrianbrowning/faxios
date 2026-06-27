import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const stub = path => new URL(path, import.meta.url).pathname;

const httpStub = stub("./setup/http-adapter-stub.js");

const browserResolve = {
  alias: [
    {
      find: "./http.js",
      replacement: httpStub,
      customResolver(source, importer) {
        if (importer && importer.includes("/adapters/")) return httpStub;
        return null;
      },
    },
    { find: "follow-redirects", replacement: stub("./setup/follow-redirects-stub.js") },
    { find: "https-proxy-agent", replacement: stub("./setup/https-proxy-agent-stub.js") },
  ],
};

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
        resolve: browserResolve,
      },
      {
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
        resolve: browserResolve,
      },
    ],
  },
});