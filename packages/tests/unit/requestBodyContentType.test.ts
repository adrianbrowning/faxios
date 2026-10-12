import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { describe, it } from "vitest";
import faxios from "#src/index.ts";
import { startHTTPServer, stopHTTPServer } from "../setup/server.js";

const contentTypeOf = async (method: "patch" | "post" | "put" | "query", data: unknown) => {
  let seen: string | undefined;
  const server = await startHTTPServer((req, res) => {
    seen = req.headers["content-type"];
    req.resume();
    req.on("end", () => res.end("ok"));
  }, { port: 0 });
  try {
    await faxios.request({
      url: `http://localhost:${(server.address() as AddressInfo).port}/`,
      method,
      data,
    });
    return seen;
  }
  finally {
    await stopHTTPServer(server);
  }
};

describe("request body Content-Type (#171)", () => {
  it("uses File.type for a File body", async () => {
    assert.strictEqual(
      await contentTypeOf("put", new File([ "x" ], "a.png", { type: "image/png" })),
      "image/png"
    );
  });

  it("uses Blob.type for a typed Blob body", async () => {
    assert.strictEqual(await contentTypeOf("post", new Blob([ "x" ], { type: "text/csv" })), "text/csv");
  });

  const binaryBodies: Array<[string, () => unknown]> = [
    [ "untyped Blob", () => new Blob([ "x" ]) ],
    [ "ArrayBuffer", () => new Uint8Array([ 1, 2 ]).buffer ],
    [ "Uint8Array", () => new Uint8Array([ 1, 2 ]) ],
    [ "DataView", () => new DataView(new Uint8Array([ 1, 2 ]).buffer) ],
    [ "web ReadableStream", () => new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([ 1, 2 ]));
        controller.close();
      },
    }) ],
    [ "Node Readable", () => Readable.from([ Buffer.from("x") ]) ],
    [ "async iterable", () => ({ async* [Symbol.asyncIterator]() { yield new Uint8Array([ 1 ]); } }) ],
  ];

  for (const [ name, make ] of binaryBodies) {
    it(`does not send x-www-form-urlencoded for a ${name} body`, async () => {
      for (const method of [ "post", "put", "patch", "query" ] as const) {
        const ct = await contentTypeOf(method, make());
        assert.ok(!ct?.includes("x-www-form-urlencoded"), `${method}: got ${ct}`);
      }
    });
  }

  // Pinned: plain string bodies keep the axios-compatible fallback in 0.2.x (may change in 0.3.0).
  it("keeps x-www-form-urlencoded for a plain string body", async () => {
    assert.strictEqual(await contentTypeOf("post", "a=1"), "application/x-www-form-urlencoded");
  });
});
