import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import rule from "../../eslint-rules/no-fixed-test-port.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: "latest", sourceType: "module" },
});
const filename = "unit/example.test.ts";
const fixed = (port: number) => ({ messageId: "fixed", data: { port: String(port) } });

ruleTester.run("no-fixed-test-port", rule, {
  valid: [
    { name: "startHTTPServer with the default port", filename, code: "const server = await startHTTPServer(handler);" },
    { name: "startHTTPServer on port 0", filename, code: "const server = await startHTTPServer(handler, { port: 0 });" },
    { name: "listen on port 0", filename, code: "server.listen(0, \"127.0.0.1\", done);" },
    { name: "listen with a port object of 0", filename, code: "server.listen({ port: 0 });" },
    { name: "Bun.serve on port 0", filename, code: "const server = Bun.serve({ port: 0, fetch: handler });" },
    { name: "port from a parameter", filename, code: "function start(port) { return server.listen(port); }" },
    { name: "let binding is not followed", filename, code: "let port = 8010; server.listen(port);" },
    { name: "proxy config port is not a bind", filename, code: "faxios.get(\"/\", { proxy: { host: \"127.0.0.1\", port: 9000 } });" },
    { name: "port on an unrelated call", filename, code: "connect({ port: 8010 });" },
  ],
  invalid: [
    {
      name: "startHTTPServer with a fixed port",
      filename,
      code: "const server = await startHTTPServer(handler, { port: 8010 });",
      errors: [ fixed(8010) ],
    },
    {
      name: "startHTTPServer options-only form",
      filename,
      code: "const server = await startHTTPServer({ handler, port: 8010 });",
      errors: [ fixed(8010) ],
    },
    { name: "listen with a fixed port", filename, code: "server.listen(8010);", errors: [ fixed(8010) ] },
    { name: "chained listen", filename, code: "const server = http.createServer(handler).listen(3000);", errors: [ fixed(3000) ] },
    { name: "listen with a port object", filename, code: "server.listen({ port: 8010 });", errors: [ fixed(8010) ] },
    { name: "Deno.serve with a fixed port", filename, code: "Deno.serve({ port: 8000 }, handler);", errors: [ fixed(8000) ] },
    {
      name: "const holding a port",
      filename,
      code: "const SERVER_PORT = 8010; const server = await startHTTPServer(handler, { port: SERVER_PORT });",
      errors: [ fixed(8010) ],
    },
    {
      name: "shorthand const port",
      filename,
      code: "const port = 8010; server.listen({ port });",
      errors: [ fixed(8010) ],
    },
    {
      name: "const used as the listen argument",
      filename,
      code: "const PORT = 8010; server.listen(PORT, done);",
      errors: [ fixed(8010) ],
    },
  ],
});
