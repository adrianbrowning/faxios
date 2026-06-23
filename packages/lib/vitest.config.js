import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

const stub = (path) => new URL(path, import.meta.url).pathname;

const httpStub = stub('./tests/setup/http-adapter-stub.js');

const browserResolve = {
  alias: [
    {
      find: './http.js',
      replacement: httpStub,
      customResolver(source, importer) {
        if (importer && importer.includes('/adapters/')) return httpStub;
        return null;
      },
    },
    { find: 'follow-redirects', replacement: stub('./tests/setup/follow-redirects-stub.js') },
    { find: 'https-proxy-agent', replacement: stub('./tests/setup/https-proxy-agent-stub.js') },
  ],
};

export default defineConfig({
  test: {
    testTimeout: 10000,
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.{js,ts}'],
          setupFiles: [],
          maxWorkers: 1,
          minWorkers: 1,
        },
      },
      {
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.browser.test.{js,ts}'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
          setupFiles: ['tests/setup/browser.setup.ts'],
        },
        resolve: browserResolve,
      },
      {
        test: {
          name: 'browser-headless',
          include: ['tests/browser/**/*.browser.test.{js,ts}'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [
              { browser: 'chromium', headless: true },
              { browser: 'firefox', headless: true },
              { browser: 'webkit', headless: true },
            ],
          },
          setupFiles: ['tests/setup/browser.setup.ts'],
        },
        resolve: browserResolve,
      },
    ],
  },
});