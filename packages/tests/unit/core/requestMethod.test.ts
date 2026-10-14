import assert from "node:assert";
import { describe, it } from "vitest";
import faxios from "#src/index.ts";
import type { FaxiosRequestConfig } from "#src/index.ts";

function recorder() {
  const methods: Array<string> = [];
  const fetch = async (input: Request | string | URL, init?: RequestInit) => {
    methods.push(input instanceof Request ? input.method : init?.method ?? "GET");
    return new Response(null, { status: 200 });
  };
  return { fetch, methods };
}

describe("request method", () => {
  it.each([ "", 0, false ])("rejects an explicit method %j with ERR_BAD_OPTION_VALUE and sends nothing", async method => {
    const { fetch, methods } = recorder();
    const config = { url: "https://api.example.com/x", method, env: { fetch } } as unknown as FaxiosRequestConfig;

    await assert.rejects(faxios.request(config), {
      code: "ERR_BAD_OPTION_VALUE",
      message: "option method must be an HTTP method name",
    });
    assert.deepStrictEqual(methods, []);
  });

  it.each([ "", 0, false ])("rejects an explicit method %j passed through an alias config", async method => {
    const { fetch, methods } = recorder();
    const config = { method, env: { fetch } } as unknown as FaxiosRequestConfig;

    await assert.rejects(faxios("https://api.example.com/x", config), { code: "ERR_BAD_OPTION_VALUE" });
    assert.deepStrictEqual(methods, []);
  });

  it("rejects an invalid instance default method", async () => {
    const { fetch, methods } = recorder();
    const instance = faxios.create({ env: { fetch } });
    (instance.defaults as Record<string, unknown>)["method"] = "";

    await assert.rejects(instance.request({ url: "https://api.example.com/x" }), { code: "ERR_BAD_OPTION_VALUE" });
    assert.deepStrictEqual(methods, []);
  });

  it.each([ undefined, null ])("treats method %j as absent and sends GET", async method => {
    const { fetch, methods } = recorder();
    const config = { url: "https://api.example.com/x", method, env: { fetch } } as unknown as FaxiosRequestConfig;

    await faxios.request(config);
    assert.deepStrictEqual(methods, [ "GET" ]);
  });

  it("sends GET when no method is given", async () => {
    const { fetch, methods } = recorder();

    await faxios.request({ url: "https://api.example.com/x", env: { fetch } });
    assert.deepStrictEqual(methods, [ "GET" ]);
  });

  it("uses the instance default method when the request gives none", async () => {
    const { fetch, methods } = recorder();
    const instance = faxios.create({ method: "post", env: { fetch } });

    await instance.request({ url: "https://api.example.com/x" });
    assert.deepStrictEqual(methods, [ "POST" ]);
  });
});
