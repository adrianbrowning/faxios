import http from "node:http";
import faxios from "faxios";
import { afterEach, describe, expect, it } from "vitest";

// Real fetch against a real server: a body that fetch drops never reaches a mock's Request.
const startServer = received =>
  new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", chunk => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        received.push({ bytes: body.byteLength, contentLength: req.headers["content-length"], text: body.toString("utf8") });
        res.end("ok");
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });

describe("request bodies reach the server (dist export only)", () => {
  let server;

  afterEach(async () => {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    server = undefined;
  });

  const big = "x".repeat(200 * 1024);
  const cases = [
    [ "a string", "abc", "abc" ],
    [ "a JSON object", { name: "a" }, JSON.stringify({ name: "a" }) ],
    [ "a 200 KB string", big, big ],
  ];

  for (const [ name, data, expected ] of cases) {
    it(`POST with ${name}`, async () => {
      const received = [];
      server = await startServer(received);

      await faxios.post(`http://127.0.0.1:${server.address().port}/`, data);

      expect(received).toHaveLength(1);
      expect(received[0].bytes).toBe(expected.length);
      expect(received[0].contentLength).toBe(String(expected.length));
      expect(received[0].text).toBe(expected);
    });
  }

  it("POST with an async generator sends every chunk", async () => {
    const received = [];
    server = await startServer(received);
    async function* chunks() {
      yield "ab";
      yield new TextEncoder().encode("cd");
    }

    await faxios.post(`http://127.0.0.1:${server.address().port}/`, chunks());

    expect(received).toHaveLength(1);
    expect(received[0].text).toBe("abcd");
  });
});
