import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { describe, it } from "vitest";
import faxios from "#src/index.ts";
import { startHTTPServer, stopHTTPServer } from "../setup/server.js";

const contentTypeOf = async (
  method: "patch" | "post" | "put" | "query",
  data: unknown,
  config: { headers?: { "Content-Type": false | null; }; onUploadProgress?: () => void; } = {}
) => {
  let seen: string | undefined;
  const server = await startHTTPServer((req, res) => {
    seen = req.headers["content-type"];
    req.resume();
    req.on("end", () => res.end("ok"));
  }, { port: 0 });
  try {
    await faxios.request({
      ...config,
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

  it("lets fetch set text/plain;charset=UTF-8 for a plain string body", async () => {
    for (const method of [ "post", "put", "patch", "query" ] as const) {
      assert.strictEqual(await contentTypeOf(method, "a=1"), "text/plain;charset=UTF-8", method);
    }
  });

  // With onUploadProgress the body reaches fetch as a counted stream, which fetch gives no Content-Type.
  it("keeps text/plain;charset=UTF-8 for a plain string body sent with onUploadProgress", async () => {
    assert.strictEqual(await contentTypeOf("post", "a=1", { onUploadProgress: () => {} }), "text/plain;charset=UTF-8");
  });

  // `null` and `false` keep the header off the request, so fetch must not add text/plain either.
  it.each([ null, false ] as const)("sends no Content-Type for a string body with Content-Type: %s", async value => {
    assert.strictEqual(await contentTypeOf("post", "a=1", { headers: { "Content-Type": value } }), undefined);
    assert.strictEqual(await contentTypeOf("post", { a: 1 }, { headers: { "Content-Type": value } }), undefined);
  });
});
