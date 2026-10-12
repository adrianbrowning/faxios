import assert from "node:assert";
import { describe, it } from "vitest";
import faxios from "#src/index.ts";
import FaxiosHeaders from "#src/lib/core/FaxiosHeaders.js";
import { startHTTPServer, stopHTTPServer } from "../../setup/server.js";

const cases: Array<[string, Array<string>]> = [
  [ "no", []],
  [ "one", [ "a=1; path=/" ]],
  [ "several", [ "a=1; path=/", "b=2; httponly", "c=3" ]],
];

describe("FaxiosHeaders#getSetCookie", () => {
  describe("from FaxiosHeaders.from", () => {
    it.each(cases)("returns an array for %s set-cookie values", (_label, cookies) => {
      const input = cookies.length === 0 ? {} : { "set-cookie": cookies.length === 1 ? cookies[0] : cookies };

      assert.deepStrictEqual(FaxiosHeaders.from(input).getSetCookie(), cookies);
    });
  });

  describe("from a server response", () => {
    it.each(cases)("returns an array for %s set-cookie headers", async (_label, cookies) => {
      const server = await startHTTPServer((_req, res) => {
        if (cookies.length > 0) {
          res.setHeader("Set-Cookie", cookies);
        }
        res.end("ok");
      });

      try {
        const { port } = server.address() as { port: number; };
        const res = await faxios.get(`http://localhost:${port}`);
        assert.ok(res.headers instanceof FaxiosHeaders);
        assert.deepStrictEqual(res.headers.getSetCookie(), cookies);
      }
      finally {
        await stopHTTPServer(server);
      }
    });
  });
});
