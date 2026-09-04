import assert from "node:assert";
import { afterEach, describe, it } from "vitest";
import faxios from "#src/index.js";

type CapturedFetch = {
  input?: unknown;
  init?: Record<string, unknown>;
};

const ObjProto = Object.prototype as unknown as Record<string, unknown>;
const POLLUTED_KEYS = [
  "cache",
  "redirect",
  "referrer",
  "referrerPolicy",
  "mode",
  "integrity",
  "keepalive",
  "priority",
  "window",
] as const;

const captureFetch = (captured: CapturedFetch) =>
  (async (input: unknown, init?: unknown) => {
    captured.input = input;
    captured.init = init as Record<string, unknown>;
    return new Response("{}", {
      headers: { "content-type": "application/json" },
    });
  }) as unknown as (
    input: string | Request | URL,
    init?: RequestInit
  ) => Promise<Response>;

const request = async (
  captured: CapturedFetch,
  fetchOptions?: Record<string, unknown>
) => {
  await faxios.get("http://localhost:9/pinned", {
    env: { fetch: captureFetch(captured) },
    ...(fetchOptions ? { fetchOptions } : {}),
  });
};

afterEach(() => {
  for (const key of POLLUTED_KEYS) {
    delete ObjProto[key];
  }
});

describe("fetch adapter RequestInit pinning", () => {
  it("does not let Object.prototype.redirect reach the outgoing request", async () => {
    ObjProto["redirect"] = "manual";

    const captured: CapturedFetch = {};
    await request(captured);

    assert.ok(captured.input instanceof Request, "expected a Request input");
    assert.strictEqual(
      captured.input.redirect,
      "follow",
      "polluted redirect must not reach the Request"
    );
    assert.strictEqual(
      captured.init!["redirect"],
      "follow",
      "polluted redirect must not reach the fetch init"
    );
  });

  it("hands the platform an init object with a null prototype", async () => {
    const captured: CapturedFetch = {};
    await request(captured);

    assert.strictEqual(
      Object.getPrototypeOf(captured.init!),
      null,
      "fetch init must not inherit from Object.prototype"
    );
  });

  it("pins the remaining RequestInit defaults against Object.prototype pollution", async () => {
    ObjProto["mode"] = "same-origin";
    ObjProto["integrity"] = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    ObjProto["keepalive"] = true;
    ObjProto["cache"] = "force-cache";
    ObjProto["referrer"] = "http://evil.example/";
    ObjProto["referrerPolicy"] = "unsafe-url";
    ObjProto["priority"] = "high";

    const captured: CapturedFetch = {};
    await request(captured);

    assert.ok(captured.input instanceof Request, "expected a Request input");
    assert.strictEqual(captured.input.mode, "cors", "mode must stay pinned");
    assert.strictEqual(captured.input.integrity, "", "integrity must stay pinned");
    assert.strictEqual(captured.input.keepalive, false, "keepalive must stay pinned");
    assert.strictEqual(captured.input.cache, "default", "cache must stay pinned");
    assert.strictEqual(
      captured.input.referrerPolicy,
      "",
      "referrerPolicy must stay pinned"
    );

    assert.deepStrictEqual(
      {
        mode: captured.init!["mode"],
        integrity: captured.init!["integrity"],
        keepalive: captured.init!["keepalive"],
        cache: captured.init!["cache"],
        referrer: captured.init!["referrer"],
        referrerPolicy: captured.init!["referrerPolicy"],
        priority: captured.init!["priority"],
        window: captured.init!["window"],
      },
      {
        mode: "cors",
        integrity: "",
        keepalive: false,
        cache: "default",
        referrer: "about:client",
        referrerPolicy: "",
        priority: "auto",
        window: null,
      },
      "every pinned field must be an own value on the fetch init"
    );
  });

  it("lets a genuine config.fetchOptions value win over the pinned default", async () => {
    ObjProto["cache"] = "force-cache";

    const captured: CapturedFetch = {};
    await request(captured, { cache: "no-store" });

    assert.ok(captured.input instanceof Request, "expected a Request input");
    assert.strictEqual(
      captured.input.cache,
      "no-store",
      "fetchOptions.cache must win over the pinned default"
    );
    assert.strictEqual(captured.init!["cache"], "no-store");
  });
});
