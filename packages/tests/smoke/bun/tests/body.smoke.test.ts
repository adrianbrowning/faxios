import { afterEach, describe, expect, test } from "bun:test";
import faxios from "faxios";

// Real fetch against a real server: a body that fetch drops never reaches a mock's Request.
type Received = { bytes: number; contentLength: null | string; text: string; };

let server: ReturnType<typeof Bun.serve> | undefined;

const startServer = (received: Array<Received>) => {
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const body = new Uint8Array(await req.arrayBuffer());
      received.push({ bytes: body.byteLength, contentLength: req.headers.get("content-length"), text: new TextDecoder().decode(body) });
      return new Response("ok");
    },
  });
  return `http://127.0.0.1:${server.port}/`;
};

describe("request bodies reach the server", () => {
  afterEach(async () => {
    await server?.stop(true);
    server = undefined;
  });

  const big = "x".repeat(200 * 1024);
  const cases: Array<[string, unknown, string]> = [
    [ "a string", "abc", "abc" ],
    [ "a JSON object", { name: "a" }, JSON.stringify({ name: "a" }) ],
    [ "a 200 KB string", big, big ],
  ];

  for (const [ name, data, expected ] of cases) {
    test(`POST with ${name}`, async () => {
      const received: Array<Received> = [];
      const url = startServer(received);

      await faxios.post(url, data);

      expect(received).toHaveLength(1);
      expect(received[0]!.bytes).toBe(expected.length);
      expect(received[0]!.contentLength).toBe(String(expected.length));
      expect(received[0]!.text).toBe(expected);
    });
  }
});
