import assert from "node:assert";
import { Readable } from "node:stream";
import { describe, it } from "vitest";
import faxios, { FaxiosError } from "#src/index.js";
import type { FaxiosRequestConfig } from "#src/index.js";

// Each check path gets exactly LIMIT bytes, which must pass, and LIMIT + 1, which must reject,
// so a `>` turned into `>=` (or back) in any one check fails here. Multibyte strings have fewer
// UTF-16 code units than UTF-8 bytes, so a check that counts `.length` fails here too.
const LIMIT = 16;
const URL = "http://localhost/size";

type Env = NonNullable<FaxiosRequestConfig["env"]>;

const bytes = (n: number) => new Uint8Array(n).fill(97);

// A web stream of n bytes in two chunks, so the counter sees a running total.
const byteStream = (n: number) => {
  const half = Math.floor(n / 2);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes(half));
      controller.enqueue(bytes(n - half));
      controller.close();
    },
  });
};

const isBodyTooLarge = (err: unknown) =>
  err instanceof FaxiosError &&
  err.code === FaxiosError.ERR_BAD_REQUEST &&
  err.message === "Request body larger than maxBodyLength limit";

const isContentTooLarge = (err: unknown) =>
  err instanceof FaxiosError &&
  err.code === FaxiosError.ERR_BAD_RESPONSE &&
  err.message === `maxContentLength size of ${LIMIT} exceeded`;

// A fetch that reads the whole request body, as a real one does, and answers "ok". `received`
// is the number of body bytes it read on its last call.
function uploadSink() {
  const sink = { calls: 0,
    received: 0,
    fetch: async (input: Request | string, init?: RequestInit) => {
      sink.calls++;
      const body = typeof input === "string" ? init?.body : input.body;
      sink.received = body == null ? 0 : (await new Response(body).arrayBuffer()).byteLength;
      return new Response("ok");
    } };
  return sink;
}

// A fetch that answers with `respond()` and counts its calls.
function respondWith(respond: (input: Request | string, init?: RequestInit) => unknown) {
  const sink = { calls: 0,
    fetch: async (input: Request | string, init?: RequestInit) => {
      sink.calls++;
      return respond(input, init);
    } };
  return sink;
}

const post = async (data: unknown, env: Env) =>
  faxios.post(URL, data, { maxBodyLength: LIMIT, env, headers: { "Content-Type": "application/octet-stream" } });

const get = async (url: string, env: Env, config: FaxiosRequestConfig = {}) =>
  faxios.get(url, { maxContentLength: LIMIT, env, ...config });

describe("adapters::fetch size limit option values", () => {
  it.each([ "maxContentLength", "maxBodyLength" ] as const)("rejects a %s that would switch the limit off", async key => {
    const sink = respondWith(() => new Response("a".repeat(LIMIT + 1)));
    for (const value of [ String(LIMIT), Number.NaN, Number.POSITIVE_INFINITY, null, -2, -0.5 ]) {
      await assert.rejects(
        faxios.post(URL, "a".repeat(LIMIT + 1), { [key]: value as never, env: { fetch: sink.fetch } as Env }),
        (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION_VALUE && err.message.includes(key),
        `${key}: ${String(value)}`
      );
    }
    assert.strictEqual(sink.calls, 0);
    // -1 is unlimited; LIMIT is a real limit, so one byte more is still rejected by the guard.
    await faxios.post(URL, "a", { [key]: -1, env: { fetch: sink.fetch } as Env });
    await assert.rejects(
      faxios.post(URL, "a".repeat(LIMIT + 1), { [key]: LIMIT, env: { fetch: sink.fetch } as Env }),
      key === "maxBodyLength" ? isBodyTooLarge : isContentTooLarge
    );
  });
});

describe.runIf(typeof fetch === "function")("adapters::fetch size limits at the boundary", () => {
  describe("maxBodyLength, known-size preflight", () => {
    it.each([
      [ "string", (n: number) => "a".repeat(n) ],
      [ "Uint8Array", bytes ],
      [ "ArrayBuffer", (n: number) => bytes(n).buffer ],
      [ "Blob", (n: number) => new Blob([ bytes(n) ]) ],
    ])("sends a %s of exactly the limit and rejects one byte more before sending", async (_name, make) => {
      const sink = uploadSink();
      await post(make(LIMIT), { fetch: sink.fetch } as Env);
      assert.strictEqual(sink.received, LIMIT);

      await assert.rejects(post(make(LIMIT + 1), { fetch: sink.fetch } as Env), isBodyTooLarge);
      assert.strictEqual(sink.calls, 1);
    });

    it.each([
      [ "2-byte", "é" ],
      [ "3-byte", "€" ],
      [ "4-byte (surrogate pair)", "😀" ],
    ])("counts a %s string in UTF-8 bytes, not UTF-16 code units", async (_name, char) => {
      const perChar = new TextEncoder().encode(char).byteLength;
      const fits = char.repeat(Math.floor(LIMIT / perChar)) + "a".repeat(LIMIT % perChar);
      const over = fits + "a";
      assert.ok(over.length <= LIMIT, "the oversized string must be under the limit in code units");

      const sink = uploadSink();
      await post(fits, { fetch: sink.fetch } as Env);
      assert.strictEqual(sink.received, LIMIT);

      await assert.rejects(post(over, { fetch: sink.fetch } as Env), isBodyTooLarge);
      assert.strictEqual(sink.calls, 1);
    });
  });

  describe("maxBodyLength, FormData fields preflight", () => {
    // The fields are a lower bound for the multipart body: fields of exactly the limit pass the
    // preflight and reach fetch, where the multipart framing takes the streamed count over it.
    // One byte more rejects before fetch is called. String fields only: undici rejects unhandled
    // when a FormData body is cancelled while it streams a Blob part.
    it.each([
      [ "string field", (n: number) => "a".repeat(n), LIMIT + 1 ],
      // 2-byte characters step by 2.
      [ "multibyte string field", (n: number) => "é".repeat(n / 2), LIMIT + 2 ],
    ])("lets a %s of exactly the limit through the preflight and rejects one byte more before sending", async (_name, make, over) => {
      const form = (n: number) => {
        const data = new FormData();
        data.append("field", make(n));
        return data;
      };
      const sink = uploadSink();
      await assert.rejects(faxios.post(URL, form(LIMIT), { maxBodyLength: LIMIT, env: { fetch: sink.fetch } as Env }), isBodyTooLarge);
      assert.strictEqual(sink.calls, 1);

      await assert.rejects(faxios.post(URL, form(over), { maxBodyLength: LIMIT, env: { fetch: sink.fetch } as Env }), isBodyTooLarge);
      assert.strictEqual(sink.calls, 1);
    });

    it("rejects multibyte string fields under the limit in code units but over it in bytes", async () => {
      const data = new FormData();
      data.append("field", "é".repeat(LIMIT));
      const sink = uploadSink();

      await assert.rejects(faxios.post(URL, data, { maxBodyLength: LIMIT, env: { fetch: sink.fetch } as Env }), isBodyTooLarge);
      assert.strictEqual(sink.calls, 0);
    });
  });

  describe("maxBodyLength, streamed upload", () => {
    it.each([
      [ "web stream", byteStream, {}],
      [ "Node stream", (n: number) => Readable.from([ Buffer.from(bytes(n)) ]), {}],
      [ "web stream without a Request constructor", byteStream, { Request: null }],
    ])("sends a %s of exactly the limit and rejects one byte more while sending", async (_name, make, extraEnv) => {
      const sink = uploadSink();
      await post(make(LIMIT), { ...extraEnv, fetch: sink.fetch } as Env);
      assert.strictEqual(sink.received, LIMIT);

      await assert.rejects(post(make(LIMIT + 1), { ...extraEnv, fetch: sink.fetch } as Env), isBodyTooLarge);
    });
  });

  describe("maxContentLength, data: URL estimate", () => {
    const toBase64 = (n: number) => Buffer.from(bytes(n)).toString("base64");

    it.each([
      [ "plain", (n: number) => "data:text/plain," + "a".repeat(n), LIMIT + 1 ],
      [ "percent-encoded", (n: number) => "data:text/plain," + "%61".repeat(n), LIMIT + 1 ],
      [ "base64", (n: number) => "data:application/octet-stream;base64," + toBase64(n), LIMIT + 1 ],
      // 2-byte characters step by 2.
      [ "multibyte", (n: number) => "data:text/plain," + "é".repeat(n / 2), LIMIT + 2 ],
    ])("reads a %s data: URL of exactly the limit and rejects one byte more before fetching", async (_name, make, over) => {
      const sink = respondWith(async (input, init) => fetch(input, init));
      const response = await get(make(LIMIT), { fetch: sink.fetch } as Env, { responseType: "arraybuffer" });
      assert.strictEqual((response.data as ArrayBuffer).byteLength, LIMIT);

      await assert.rejects(get(make(over), { fetch: sink.fetch } as Env), isContentTooLarge);
      assert.strictEqual(sink.calls, 1);
    });
  });

  describe("maxContentLength, declared Content-Length", () => {
    it("accepts a declared length of exactly the limit and rejects one byte more", async () => {
      const ok = respondWith(() => new Response(bytes(LIMIT), { headers: { "Content-Length": String(LIMIT) } }));
      const response = await get(URL, { fetch: ok.fetch } as Env, { responseType: "arraybuffer" });
      assert.strictEqual((response.data as ArrayBuffer).byteLength, LIMIT);

      // An empty body: only the declared length is over the limit.
      const over = respondWith(() => new Response(null, { headers: { "Content-Length": String(LIMIT + 1) } }));
      await assert.rejects(get(URL, { fetch: over.fetch } as Env), isContentTooLarge);
    });
  });

  describe("maxContentLength, streamed download", () => {
    it.each([
      [ "byte stream", (n: number) => byteStream(n), LIMIT + 1 ],
      [ "multibyte string", (n: number) => "é".repeat(n / 2), LIMIT + 2 ],
    ])("reads a %s body of exactly the limit and rejects one byte more", async (_name, make, over) => {
      const ok = respondWith(() => new Response(make(LIMIT)));
      const response = await get(URL, { fetch: ok.fetch } as Env, { responseType: "arraybuffer" });
      assert.strictEqual((response.data as ArrayBuffer).byteLength, LIMIT);

      const big = respondWith(() => new Response(make(over)));
      await assert.rejects(get(URL, { fetch: big.fetch } as Env), isContentTooLarge);
    });
  });

  describe("maxContentLength, materialized body", () => {
    // A Response-like value with no stream body: the counting stream wrapper can't apply, so the
    // materialized data is measured instead, whether or not the runtime has stream responses.
    const bodiless = (text: string) => ({
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      body: null,
      text: async () => text,
      arrayBuffer: async () => new TextEncoder().encode(text).buffer,
    });

    it.each([
      [ "string", (n: number) => "a".repeat(n), LIMIT + 1, "text" ],
      [ "multibyte string", (n: number) => "é".repeat(n / 2), LIMIT + 2, "text" ],
      [ "ArrayBuffer", (n: number) => "a".repeat(n), LIMIT + 1, "arraybuffer" ],
    ] as const)("measures a %s from a bodiless Response-like value at the limit and one byte more", async (_name, make, over, responseType) => {
      const ok = respondWith(() => bodiless(make(LIMIT)));
      await get(URL, { fetch: ok.fetch } as Env, { responseType });

      const big = respondWith(() => bodiless(make(over)));
      await assert.rejects(get(URL, { fetch: big.fetch } as Env, { responseType }), isContentTooLarge);
    });

    it("rejects a multibyte string under the limit in code units but over it in bytes", async () => {
      const big = respondWith(() => bodiless("é".repeat(LIMIT)));
      await assert.rejects(get(URL, { fetch: big.fetch } as Env, { responseType: "text" }), isContentTooLarge);
    });

    it("measures the materialized body when the runtime's Response is disabled", async () => {
      const ok = respondWith(() => new Response(bytes(LIMIT)));
      const response = await get(URL, { fetch: ok.fetch, Response: null } as unknown as Env, { responseType: "arraybuffer" });
      assert.strictEqual((response.data as ArrayBuffer).byteLength, LIMIT);

      const big = respondWith(() => new Response(bytes(LIMIT + 1)));
      await assert.rejects(get(URL, { fetch: big.fetch, Response: null } as unknown as Env), isContentTooLarge);
    });
  });
});

describe("adapters::fetch size limits set by middleware", () => {
  it.each([ "maxContentLength", "maxBodyLength" ] as const)("rejects a %s that middleware sets to an invalid value", async key => {
    const sink = respondWith(() => new Response("a".repeat(LIMIT + 1)));
    for (const value of [ "1048576", Number.NaN, Number.POSITIVE_INFINITY, null, -2, -0.5 ]) {
      const instance = faxios.create({ [key]: LIMIT, env: { fetch: sink.fetch } as Env }).use(async (ctx, next) => {
        Object.assign(ctx.config, { [key]: value });
        return next(ctx);
      });
      await assert.rejects(
        instance.post(URL, "a".repeat(LIMIT + 1)),
        (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION_VALUE && err.message.includes(key),
        `${key}: ${String(value)}`
      );
    }
    assert.strictEqual(sink.calls, 0);
  });
});

describe("adapters::fetch size limit option values checked before middleware", () => {
  const isBadOption = (key: string) => (err: unknown) =>
    err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION_VALUE && err.message.includes(key);

  it.each([ "maxContentLength", "maxBodyLength" ] as const)("rejects a per-request %s before any middleware runs", async key => {
    const sink = respondWith(() => new Response("ok"));
    let ran = false;
    const instance = faxios.create({ env: { fetch: sink.fetch } as Env }).use(async (ctx, next) => {
      ran = true;
      return next(ctx);
    });
    await assert.rejects(instance.post(URL, "a", { [key]: "1" as never }), isBadOption(key));
    assert.strictEqual(ran, false);
    assert.strictEqual(sink.calls, 0);
  });

  it("getUri rejects invalid size limits", () => {
    assert.throws(() => faxios.getUri({ url: URL, maxBodyLength: Number.NaN }), isBadOption("maxBodyLength"));
    assert.throws(() => faxios.getUri({ url: URL, maxContentLength: "1" as never }), isBadOption("maxContentLength"));
  });

  it.runIf(typeof fetch === "function").each([ 0, -0 ])("accepts maxBodyLength %s at the boundary", async limit => {
    const sink = uploadSink();
    const headers = { "Content-Type": "application/octet-stream" };
    await faxios.post(URL, bytes(0), { maxBodyLength: limit, headers, env: { fetch: sink.fetch } as Env });
    assert.strictEqual(sink.calls, 1);
    assert.strictEqual(sink.received, 0);
    await assert.rejects(faxios.post(URL, bytes(1), { maxBodyLength: limit, headers, env: { fetch: sink.fetch } as Env }), isBodyTooLarge);
    assert.strictEqual(sink.calls, 1);
  });
});
