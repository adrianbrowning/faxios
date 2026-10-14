import { assertEquals } from "@std/assert";
import faxios from "faxios";

// Real fetch against a real server: a body that fetch drops never reaches a mock's Request.
type Received = { bytes: number; contentLength: null | string; text: string; };

const big = "x".repeat(200 * 1024);
const cases: Array<[string, unknown, string]> = [
  [ "a string", "abc", "abc" ],
  [ "a JSON object", { name: "a" }, JSON.stringify({ name: "a" }) ],
  [ "a 200 KB string", big, big ],
];

for (const [ name, data, expected ] of cases) {
  Deno.test(`request bodies reach the server: POST with ${name}`, async () => {
    const received: Array<Received> = [];
    const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen() {} }, async req => {
      const body = new Uint8Array(await req.arrayBuffer());
      received.push({ bytes: body.byteLength, contentLength: req.headers.get("content-length"), text: new TextDecoder().decode(body) });
      return new Response("ok");
    });
    try {
      await faxios.post(`http://127.0.0.1:${server.addr.port}/`, data);

      assertEquals(received.length, 1);
      assertEquals(received[0]!.bytes, expected.length);
      assertEquals(received[0]!.contentLength, String(expected.length));
      assertEquals(received[0]!.text, expected);
    }
    finally {
      await server.shutdown();
    }
  });
}
