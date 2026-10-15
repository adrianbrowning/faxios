import assert from "node:assert";
import { describe, it } from "vitest";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { fetchFaxios } from "./_helpers.js";

// What the adapter's size checks and error classification give a caller, through `env.fetch`.

type EnvFetch = (input: unknown, init?: RequestInit) => Promise<unknown>;
const env = (fetch: EnvFetch) => ({ fetch } as unknown as { fetch?: typeof globalThis.fetch; });

// A Response-like value with no stream body, so the adapter measures the body once it is read.
const bufferedResponse = (data: unknown) => ({
  status: 200,
  statusText: "OK",
  headers: {},
  text: async () => data,
  arrayBuffer: async () => data,
  blob: async () => data,
});

const rejection = async (promise: Promise<unknown>): Promise<FaxiosError> => {
  try {
    await promise;
  }
  catch (err) {
    assert.ok(err instanceof FaxiosError);
    return err;
  }
  assert.fail("expected the request to reject");
};

const assertContentTooLarge = (err: FaxiosError, limit: number) => {
  assert.strictEqual(err.code, FaxiosError.ERR_BAD_RESPONSE);
  assert.strictEqual(err.message, `maxContentLength size of ${limit} exceeded`);
  assert.ok(err.request instanceof Request, "the error carries the request that was sent");
};

describe("fetch adapter maxContentLength", () => {
  const declared = (length: number) => env(async () => new Response("x", { headers: { "Content-Length": String(length) } }));

  it("passes a declared Content-Length of exactly the cap", async () => {
    const { data } = await fetchFaxios.get("/", { maxContentLength: 100, env: declared(100) });
    assert.strictEqual(data, "x");
  });

  it("rejects a declared Content-Length one byte over the cap before reading the body", async () => {
    assertContentTooLarge(await rejection(fetchFaxios.get("/", { maxContentLength: 100, env: declared(101) })), 100);
  });

  it.each([
    [ "text", "string", (n: number) => "x".repeat(n) ],
    [ "arraybuffer", "ArrayBuffer", (n: number) => new ArrayBuffer(n) ],
    [ "blob", "Blob", (n: number) => new Blob([ "x".repeat(n) ]) ],
  ] as const)("measures a %s body read whole (%s): exactly the cap passes, one byte over rejects", async (responseType, _label, make) => {
    await fetchFaxios.get("/", { responseType, maxContentLength: 100, env: env(async () => bufferedResponse(make(100))) });
    const err = await rejection(fetchFaxios.get("/", { responseType, maxContentLength: 100, env: env(async () => bufferedResponse(make(101))) }));
    assertContentTooLarge(err, 100);
  });

  it("measures a string body in UTF-8 bytes, not UTF-16 code units", async () => {
    await fetchFaxios.get("/", { maxContentLength: 100, env: env(async () => bufferedResponse("é".repeat(50))) });
    const err = await rejection(fetchFaxios.get("/", { maxContentLength: 100, env: env(async () => bufferedResponse("é".repeat(51))) }));
    assertContentTooLarge(err, 100);
  });

  it("rejects a streamed body that grows past the cap with the request attached", async () => {
    const err = await rejection(fetchFaxios.get("/", { maxContentLength: 100, env: env(async () => new Response("x".repeat(101))) }));
    assertContentTooLarge(err, 100);
  });
});

describe("fetch adapter maxBodyLength", () => {
  it("rejects a known-size body over the limit before any request is built or sent", async () => {
    let sent = false;
    const err = await rejection(fetchFaxios.post("/", "x".repeat(101), {
      maxBodyLength: 100,
      env: env(async () => {
        sent = true;
        return new Response("ok");
      }),
    }));
    assert.strictEqual(err.code, FaxiosError.ERR_BAD_REQUEST);
    assert.strictEqual(err.message, "Request body larger than maxBodyLength limit");
    assert.strictEqual(err.request, undefined);
    assert.strictEqual(sent, false);
  });

  it("rejects a stream body that grows past the limit while sent, with the request attached", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(101));
        controller.close();
      },
    });
    const err = await rejection(fetchFaxios.post("/", body, {
      maxBodyLength: 100,
      headers: { "Content-Type": "application/octet-stream" },
      env: env(async input => {
        await (input as Request).arrayBuffer();
        return new Response("ok");
      }),
    }));
    assert.strictEqual(err.code, FaxiosError.ERR_BAD_REQUEST);
    assert.strictEqual(err.message, "Request body larger than maxBodyLength limit");
    assert.ok(err.request instanceof Request);
  });
});

describe("fetch adapter error classification", () => {
  it("rejects with the cancellation, carrying config and request, when the signal aborts", async () => {
    const controller = new AbortController();
    const err = await rejection(fetchFaxios.get("/", {
      signal: controller.signal,
      env: env(async (_input, init) => new Promise((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(new Error("network blip")), { once: true });
        controller.abort();
      })),
    }));
    assert.strictEqual(err.code, FaxiosError.ERR_CANCELED);
    assert.ok(err.config);
    assert.ok(err.request instanceof Request);
  });

  it.each([
    [ "a TypeError with a runtime-specific message", new TypeError("client error (Connect)"), "Network Error: client error (Connect) (GET http://example.test/)" ],
    [ "an error with a runtime-specific code", Object.assign(new Error("Unable to connect"), { code: "ConnectionRefused" }), "Network Error: ConnectionRefused (GET http://example.test/)" ],
  ])("wraps %s raised while sending as ERR_NETWORK with the error as cause", async (_label, sendErr, message) => {
    const err = await rejection(fetchFaxios.get("http://example.test/", { env: env(async () => { throw sendErr; }) }));
    assert.strictEqual(err.code, FaxiosError.ERR_NETWORK);
    assert.strictEqual(err.message, message);
    assert.strictEqual(err.cause, sendErr);
    assert.ok(err.request instanceof Request);
  });

  it("re-throws a FaxiosError from fetch as is, with the request attached", async () => {
    const original = new FaxiosError("Raw", FaxiosError.ERR_NETWORK);
    const err = await rejection(fetchFaxios.get("/", { env: env(async () => { throw original; }) }));
    assert.strictEqual(err, original);
    assert.strictEqual(err.message, "Raw");
    assert.ok(err.request instanceof Request);
  });

  it("wraps another error from reading the body with its own code and the error as cause", async () => {
    const generic = Object.assign(new Error("Something else"), { code: "ERR_UNKNOWN" });
    const err = await rejection(fetchFaxios.get("/", {
      env: env(async () => ({ ...bufferedResponse(""), text: async () => { throw generic; } })),
    }));
    assert.strictEqual(err.code, "ERR_UNKNOWN");
    assert.strictEqual(err.message, "Something else");
    assert.strictEqual(err.cause, generic);
  });
});
