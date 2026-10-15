import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { describe, it, vi } from "vitest";
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

describe("request built once (#296)", () => {
  it("constructs one Request for a POST and gives fetch an init that reuses it instead of the body", async () => {
    let constructed = 0;
    class CountingRequest extends Request {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init);
        constructed++;
      }
    }
    let seenInput: unknown;
    let seenInit: Record<string, unknown> | undefined;
    const fetch = async (input: Request | string | URL, init?: RequestInit) => {
      seenInput = input;
      seenInit = init as Record<string, unknown> | undefined;
      return new Response("ok");
    };
    const instance = faxios.create({ env: { fetch, Request: CountingRequest } });
    // The first request also runs the adapter's one-time feature checks.
    await instance.get("http://localhost/");
    constructed = 0;

    await instance.post("http://localhost/items", { a: 1 }, { fetchOptions: { next: { revalidate: 1 } } });

    assert.strictEqual(constructed, 1);
    assert.ok(seenInput instanceof CountingRequest);
    assert.strictEqual(await seenInput.text(), "{\"a\":1}");
    assert.strictEqual(seenInput.headers.get("content-type"), "application/json");
    assert.ok(seenInit);
    assert.strictEqual(Object.getPrototypeOf(seenInit), null);
    // The body moves from the Request; fetch never gets the caller's body to encode again. Node's
    // Request keeps the body on an own `null`, which also blocks a polluted Object.prototype.body.
    assert.ok(Object.hasOwn(seenInit, "body"));
    assert.strictEqual(seenInit["body"], null);
    assert.strictEqual(seenInit["headers"], seenInput.headers);
    assert.strictEqual(seenInit["method"], "POST");
    assert.deepStrictEqual(seenInit["next"], { revalidate: 1 });
  });

  // How each runtime treats `new Request(request, { body })`. Node and Deno keep the body on an
  // own `null`; Bun drops it there. Deno reads an own `undefined` as missing, Bun doesn't.
  const runtimeRequest = (nullDropsBody: boolean) => class extends Request {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const hasOwnBody = init !== undefined && Object.hasOwn(init, "body");
      if (nullDropsBody && input instanceof Request && hasOwnBody && init.body === null) {
        super(input.url, { method: input.method, headers: input.headers });
        return;
      }
      super(input, init);
    }
  };

  it.each([
    [ "keeps the body on null (Node, Deno)", false, null ],
    [ "drops the body on null (Bun)", true, undefined ],
  ] as const)("sends the body when the runtime's Request %s", async (_name, nullDropsBody, expected) => {
    const RuntimeRequest = runtimeRequest(nullDropsBody);
    let initBody: unknown = "unset";
    let sent: null | string = null;
    const fetch = async (input: Request | string | URL, init?: RequestInit) => {
      assert.ok(init && Object.hasOwn(init, "body"));
      initBody = init.body;
      sent = await new RuntimeRequest(input, init).text();
      return new Response("ok");
    };

    await faxios.post("http://localhost/", "real", { env: { fetch, Request: RuntimeRequest } });

    assert.strictEqual(initBody, expected);
    assert.strictEqual(sent, "real");
  });

  // fetch builds its own Request from the Request and the init, as undici does. An init that
  // carried the body again would hand it a stream the first Request already took.
  it("moves a stream body from the Request to fetch's own Request", async () => {
    const encoder = new TextEncoder();
    const chunks = [ "a", "b", "c" ];
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk === undefined) controller.close();
        else controller.enqueue(encoder.encode(chunk));
      },
    });
    let sent = "";
    const fetch = async (input: Request | string | URL, init?: RequestInit) => {
      sent = await new Request(input, init).text();
      return new Response("ok");
    };

    await faxios.post("http://localhost/", body, { env: { fetch } });

    assert.strictEqual(sent, "abc");
  });

  const bodyOf = async (data: unknown) => {
    let received = "";
    const server = await startHTTPServer((req, res) => {
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => {
        received += chunk;
      });
      req.on("end", () => res.end("ok"));
    }, { port: 0 });
    try {
      await faxios.post(`http://localhost:${(server.address() as AddressInfo).port}/`, data);
      return received;
    }
    finally {
      await stopHTTPServer(server);
    }
  };

  it("sends every chunk of a Readable.from body", async () => {
    assert.strictEqual(await bodyOf(Readable.from([ "a", "b", "c" ])), "abc");
  });
});

describe("JSON string request bodies (#296)", () => {
  const sentBody = async (data: string) => {
    let sent = "";
    const fetch = async (input: Request | string | URL) => {
      assert.ok(input instanceof Request);
      sent = await input.text();
      return new Response("ok");
    };
    await faxios.post("http://localhost/", data, {
      headers: { "Content-Type": "application/json" },
      responseType: "text",
      env: { fetch },
    });
    return sent;
  };

  it("sends a string body with a JSON Content-Type without parsing it", async () => {
    const parse = vi.spyOn(JSON, "parse");
    try {
      assert.strictEqual(await sentBody(" {\"a\":1} "), "{\"a\":1}");
      assert.strictEqual(parse.mock.calls.length, 0);
    }
    finally {
      parse.mockRestore();
    }
  });

  it("sends a string that isn't JSON as given, not as a quoted JSON string", async () => {
    assert.strictEqual(await sentBody("not json"), "not json");
  });
});
