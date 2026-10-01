import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import rule from "../../eslint-rules/test-server-cleanup.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: "latest", sourceType: "module" },
});
const filename = "unit/example.test.ts";

ruleTester.run("test-server-cleanup", rule, {
  valid: [
    {
      name: "startHTTPServer stopped in finally",
      filename,
      code: `
        it("works", async () => {
          const server = await startHTTPServer(handler);
          try { await faxios.get(url(server)); }
          finally { await stopHTTPServer(server); }
        });`,
    },
    {
      name: "beforeAll start, afterAll stop",
      filename,
      code: `
        let server: Server;
        beforeAll(async () => { server = await startHTTPServer(handler); });
        afterAll(async () => { await stopHTTPServer(server); });`,
    },
    {
      name: "http.createServer().listen() closed in finally",
      filename,
      code: `
        import http from "node:http";
        it("works", async () => {
          const server = http.createServer(handler).listen(0) as Server;
          try { await faxios.get(url(server)); }
          finally { await new Promise(resolve => server.close(resolve)); }
        });`,
    },
    {
      name: "a helper that resolves the server hands teardown to its caller",
      filename,
      code: `
        import * as http from "http";
        const startServer = () => new Promise(resolve => {
          const server = http.createServer(handler);
          server.listen(0, () => resolve(server));
        });`,
    },
    {
      name: "await using disposes the server",
      filename,
      code: `await using server = await startHTTPServer(handler);`,
    },
    {
      name: "net servers are not HTTP servers",
      filename,
      code: `
        import net from "node:net";
        const srv = net.createServer();`,
    },
  ],
  invalid: [
    {
      name: "stopped only on the success path",
      filename,
      code: `
        const server = await startHTTPServer(handler);
        await faxios.get(url(server));
        await stopHTTPServer(server);`,
      errors: [{ messageId: "unguarded" }],
    },
    {
      name: "never stopped",
      filename,
      code: `const server = await startHTTPServer(handler, { port: 4444 });`,
      errors: [{ messageId: "unguarded" }],
    },
    {
      name: "touching the server in afterEach without stopping it",
      filename,
      code: `
        let server: Server;
        beforeEach(async () => { server = await startHTTPServer(handler); });
        afterEach(() => { inspect(server); });`,
      errors: [{ messageId: "unguarded" }],
    },
    {
      name: "passing the server to an arbitrary helper",
      filename,
      code: `useServer(await startHTTPServer(handler));`,
      errors: [{ messageId: "unbound" }],
    },
    {
      name: "server never stored",
      filename,
      code: `await startHTTPServer(handler);`,
      errors: [{ messageId: "unbound" }],
    },
    {
      name: "named createServer import",
      filename,
      code: `
        import { createServer } from "node:http";
        const server = createServer(handler).listen(0);
        await faxios.get(url(server));`,
      errors: [{ messageId: "unguarded" }],
    },
    {
      name: "Bun.serve never stopped",
      filename,
      code: `const server = Bun.serve({ port: 0, fetch: handler });`,
      errors: [{ messageId: "unguarded" }],
    },
    {
      name: "an unverified helper in finally does not count as teardown",
      filename,
      code: `
        const server = await startHTTPServer(handler);
        try { await faxios.get(url(server)); }
        finally { log(server); }`,
      errors: [{ messageId: "unguarded" }],
    },
    {
      name: "a look-alike stopServer helper in finally does not count as teardown",
      filename,
      code: `
        const server = await startHTTPServer(handler);
        try { await faxios.get(url(server)); }
        finally { await stopServer(server); }`,
      errors: [{ messageId: "unguarded" }],
    },
  ],
});
