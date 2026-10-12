import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// A same-origin HTTP/1.1 endpoint on the Vitest browser server, so browser tests can send real
// uploads. It answers with the number of request body bytes it received.
const uploadEndpoint = {
  name: "faxios-upload-endpoint",
  configureServer(server) {
    server.middlewares.use("/__faxios/upload", (req, res) => {
      let received = 0;
      req.on("data", chunk => {
        received += chunk.length;
      });
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ received, contentType: req.headers["content-type"] ?? null }));
      });
    });
  },
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
        plugins: [ uploadEndpoint ],
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
        plugins: [ uploadEndpoint ],
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