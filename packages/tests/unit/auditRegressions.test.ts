import assert from "node:assert";
import { describe, it } from "vitest";
import faxios, { FaxiosError } from "#src/index.ts";
import { timing } from "#src/lib/plugins/timing.ts";
import type { TimingEvent } from "#src/lib/plugins/timing.ts";

const BASE = "http://localhost";

describe("user info with an `@` in the password", () => {
  it("is stripped through the last `@` from an error message", () => {
    const error = new FaxiosError("connect ECONNREFUSED http://user:p@ss@api.example.com/items");

    assert.strictEqual(error.toJSON().message, "connect ECONNREFUSED http://api.example.com/items");
  });

  it("stops at the path, so an `@` there is kept", () => {
    const error = new FaxiosError("GET http://user:pw@api.example.com/@me failed");

    assert.strictEqual(error.toJSON().message, "GET http://api.example.com/@me failed");
  });

  it("is stripped through the last `@` from a timing error message", async () => {
    const events: Array<TimingEvent> = [];
    const api = faxios.create({ baseURL: BASE, env: { fetch: async () => new Response("") } })
      .use(timing(event => events.push(event)))
      .use(() => {
        throw new Error("connect ECONNREFUSED http://user:p@ss@localhost/timing");
      });

    await assert.rejects(api.get("/timing"), /ECONNREFUSED/);

    assert.strictEqual(events[0]!.error!.message, "connect ECONNREFUSED http://localhost/timing");
  });
});

describe("response body errors", () => {
  it("gives a formData body that can't be parsed ERR_BAD_RESPONSE, not ERR_NETWORK", async () => {
    const fetch = async () => new Response("not a form", { headers: { "Content-Type": "multipart/form-data; boundary=x" } });

    await assert.rejects(faxios.get(`${BASE}/form`, { env: { fetch }, responseType: "formdata" }), (err: unknown) => {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, "ERR_BAD_RESPONSE");
      assert.ok(err.config);
      return true;
    });
  });

  it("gives a download chunk that isn't bytes ERR_BAD_RESPONSE and the config", async () => {
    const fetch = async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(42);
        controller.close();
      },
    }));

    await assert.rejects(faxios.get(`${BASE}/bytes`, { env: { fetch }, onDownloadProgress: () => {}, responseType: "arraybuffer" }), (err: unknown) => {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, "ERR_BAD_RESPONSE");
      assert.ok(err.config);
      assert.strictEqual(err.config.url, `${BASE}/bytes`);
      return true;
    });
  });
});

describe("timeout", () => {
  for (const timeout of [ "30", true, " ", []]) {
    it(`rejects ${JSON.stringify(timeout)}, which isn't a number`, async () => {
      const fetch = async () => new Response("");

      // @ts-expect-error TS2769 -- untyped JS callers may pass anything; the runtime must reject it
      await assert.rejects(faxios.get(`${BASE}/t`, { env: { fetch }, timeout }), { code: "ERR_BAD_OPTION_VALUE" });
    });
  }
});

describe("a stream body and a throwing transformResponse", () => {
  it("cancels the stream body", async () => {
    const cancelled = Promise.withResolvers<unknown>();
    const fetch = async () => new Response(new ReadableStream({
      cancel(reason) {
        cancelled.resolve(reason);
      },
      pull() {},
    }));
    const failure = new Error("transform failed");

    await assert.rejects(faxios.get(`${BASE}/stream`, {
      env: { fetch },
      responseType: "stream",
      transformResponse: [ () => { throw failure; } ],
    }), failure);

    // Without the cancel the source stays open and this never settles (the test times out).
    assert.strictEqual(await cancelled.promise, failure);
  });
});
