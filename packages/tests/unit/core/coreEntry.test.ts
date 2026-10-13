import assert from "node:assert";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { create, FaxiosError } from "#src/core.ts";
import type { FaxiosMiddleware } from "#src/core.ts";
import { form } from "#src/form.ts";
import faxios from "#src/index.ts";
import { schema } from "#src/schema.ts";

type Sent = { body: BodyInit | null | undefined; contentType: null | string; url: string; };

// A user env.fetch that records each request and answers with `body` as JSON.
function recordingFetch(body: unknown = { ok: true }) {
  const sent: Array<Sent> = [];
  const fetch = async (input: Request | string | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    sent.push({ url: request.url, body: init?.body, contentType: request.headers.get("Content-Type") });
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  };
  return { fetch, sent };
}

async function rejection(promise: Promise<unknown>): Promise<FaxiosError> {
  const err = await promise.then(() => undefined, (error: unknown) => error);
  assert.ok(err instanceof FaxiosError, `expected a FaxiosError, got ${String(err)}`);
  return err;
}

describe("@gcmdev/faxios/core", () => {
  it("should send a GET with flat params like the root does", async () => {
    const { fetch, sent } = recordingFetch();
    const response = await create({ env: { fetch } }).get("https://api.example.com/users", {
      params: { a: "x y", b: [ 1, 2 ], c: true, d: new Date(0), e: null, f: undefined },
    });

    expect(response.data).toEqual({ ok: true });
    expect(sent[0]!.url).toBe("https://api.example.com/users?a=x+y&b%5B%5D=1&b%5B%5D=2&c=true&d=1970-01-01T00:00:00.000Z");
  });

  it("should serialize flat params exactly as the root's form serializer does", () => {
    const params = { "a ": "x/y?z", list: [ "p", "q" ], "keys[]": [ 1 ], n: 0, b: false, s: "!'()~" };
    for (const paramsSerializer of [ undefined, { indexes: true }, { indexes: null }, { indexes: true, dots: true }, { encode: (v: string, d: (s: string) => string) => d(v) }]) {
      const config = { url: "https://api.example.com/", params, paramsSerializer };
      expect(create().getUri(config)).toBe(faxios.getUri(config));
    }
  });

  it("should reject nested params with ERR_NOT_SUPPORT naming @gcmdev/faxios/form", async () => {
    const { fetch, sent } = recordingFetch();
    const err = await rejection(create({ env: { fetch } }).get("https://api.example.com/", { params: { filter: { a: 1 } } }));

    expect(err.code).toBe(FaxiosError.ERR_NOT_SUPPORT);
    expect(err.message).toContain("@gcmdev/faxios/form");
    expect(sent).toHaveLength(0);
  });

  it("should serialize nested params once form() is installed", async () => {
    const { fetch, sent } = recordingFetch();
    await create({ env: { fetch } }).use(form())
      .get("https://api.example.com/", { params: { filter: { a: 1 } } });

    expect(sent[0]!.url).toBe("https://api.example.com/?filter%5Ba%5D=1");
  });

  it("should reject multipart and urlencoded object bodies with ERR_NOT_SUPPORT naming @gcmdev/faxios/form", async () => {
    const { fetch, sent } = recordingFetch();
    const api = create({ env: { fetch } });
    for (const send of [
      async () => api.post("https://api.example.com/", { x: 1 }, { headers: { "Content-Type": "multipart/form-data" } }),
      async () => api.post("https://api.example.com/", { x: 1 }, { headers: { "Content-Type": "application/x-www-form-urlencoded" } }),
      async () => api.postForm("https://api.example.com/", { x: 1 }),
    ]) {
      const err = await rejection(send());

      expect(err.code).toBe(FaxiosError.ERR_NOT_SUPPORT);
      expect(err.message).toContain("needs @gcmdev/faxios/form; install it with use(form())");
    }
    expect(sent).toHaveLength(0);
  });

  it("should send FormData and JSON bodies without the form feature", async () => {
    const { fetch, sent } = recordingFetch();
    const api = create({ env: { fetch } });
    const data = new FormData();
    data.append("x", "1");

    await api.post("https://api.example.com/", data);
    await api.post("https://api.example.com/", { x: 1 });

    expect(sent[0]!.body).toBe(data);
    expect(sent[1]!.body).toBe("{\"x\":1}");
  });

  it("should serialize form bodies once form() is installed", async () => {
    const { fetch, sent } = recordingFetch();
    const api = create({ env: { fetch } }).use(form());

    await api.postForm("https://api.example.com/", { x: 1 });
    await api.post("https://api.example.com/", { x: 1 }, { headers: { "Content-Type": "application/x-www-form-urlencoded" }, formSerializer: { dots: true } });

    expect(sent[0]!.body).toBeInstanceOf(FormData);
    expect(sent[0]!.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(sent[1]!.body).toBe("x=1");
  });

  it("should reject formSerializer with ERR_BAD_OPTION naming @gcmdev/faxios/form", async () => {
    // @ts-expect-error TS2769 -- formSerializer needs the form feature
    const err = await rejection(create().get("https://api.example.com/", { formSerializer: { dots: true } }));

    expect(err.code).toBe(FaxiosError.ERR_BAD_OPTION);
    expect(err.message).toBe("Option formSerializer needs @gcmdev/faxios/form; install it with use(form())");
  });

  it("should reject each schema option with ERR_BAD_OPTION naming @gcmdev/faxios/schema", async () => {
    const { fetch, sent } = recordingFetch();
    const api = create({ env: { fetch } });
    for (const key of [ "paramsSchema", "pathParamsSchema", "requestSchema", "responseSchema" ]) {
      const err = await rejection(api.request({ url: "https://api.example.com/", [key]: z.unknown() }));

      expect(err.code).toBe(FaxiosError.ERR_BAD_OPTION);
      expect(err.message).toBe(`Option ${key} needs @gcmdev/faxios/schema; install it with use(schema())`);
    }
    expect(sent).toHaveLength(0);
  });

  it("should reject a schema option middleware sets without the schema feature", async () => {
    const { fetch, sent } = recordingFetch();
    const addSchema: FaxiosMiddleware = async (ctx, next) => next({ ...ctx, config: { ...ctx.config, responseSchema: z.object({ ok: z.literal(false) }) } });
    const err = await rejection(create({ env: { fetch } }).use(addSchema)
      .get("https://api.example.com/"));

    expect(err.code).toBe(FaxiosError.ERR_BAD_OPTION);
    expect(err.message).toContain("@gcmdev/faxios/schema");
    expect(sent).toHaveLength(0);
  });

  it("should validate requests and responses once schema() is installed", async () => {
    const { fetch, sent } = recordingFetch({ id: "7" });
    const api = create({ env: { fetch } }).use(schema());

    const response = await api.get("https://api.example.com/users/{id}", {
      pathParams: { id: 7 },
      pathParamsSchema: z.object({ id: z.number().transform(String) }),
      responseSchema: z.object({ id: z.string().transform(Number) }),
    });
    const err = await rejection(api.get("https://api.example.com/", { responseSchema: z.object({ id: z.number() }) }));

    expect(response.data).toEqual({ id: 7 });
    expect(sent[0]!.url).toBe("https://api.example.com/users/7");
    expect(err.code).toBe(FaxiosError.ERR_BAD_RESPONSE_SCHEMA);
  });

  it("should stop validating once schema() is ejected", async () => {
    const { fetch } = recordingFetch();
    const installed = schema();
    const api = create({ env: { fetch } }).use(installed);
    api.eject(installed);

    const err = await rejection(api.get("https://api.example.com/", { responseSchema: z.object({ ok: z.literal(false) }) }));

    expect(err.code).toBe(FaxiosError.ERR_BAD_OPTION);
  });

  it("should give an instance from create() the features installed on its parent", async () => {
    const { fetch, sent } = recordingFetch();
    const child = create({ env: { fetch } }).use(form())
      .create();

    await child.get("https://api.example.com/", { params: { filter: { a: 1 } } });

    expect(sent[0]!.url).toBe("https://api.example.com/?filter%5Ba%5D=1");
  });

  it("should install nothing from an object shaped like a feature plugin", () => {
    const fake = { name: "schema", feature: "schema" } as const;

    expect(() => create().use(fake)).toThrow(expect.objectContaining({ code: FaxiosError.ERR_BAD_OPTION_VALUE }));
  });

  it("should share no defaults with the root default instance", () => {
    const before = faxios.defaults.headers.common["X-Root"];
    faxios.defaults.headers.common["X-Root"] = "root";
    try {
      expect(create().defaults.headers.common["X-Root"]).toBeUndefined();
    }
    finally {
      faxios.defaults.headers.common["X-Root"] = before;
      if (before === undefined) delete faxios.defaults.headers.common["X-Root"];
    }
  });
});

// Type tests: never called, only compiled.
export function coreTypes(): void {
  const api = create();
  // @ts-expect-error TS2353 -- formSerializer needs the form feature
  void api.getUri({ formSerializer: { dots: true } });
  // @ts-expect-error TS2769 -- responseSchema needs the schema feature
  void api.get("/", { responseSchema: z.string() });
  // @ts-expect-error TS2353 -- define() takes no schemas without the schema feature
  void api.define("get", "/", { responseSchema: z.string() });

  const full = api.use(schema()).use(form());
  const typed: Promise<{ data: string; }> = full.get("/", { responseSchema: z.string() });
  void typed;
  void full.postForm("/", { x: 1 });
}
