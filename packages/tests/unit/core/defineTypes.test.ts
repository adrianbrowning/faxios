import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import faxios from "#src/index.ts";
import type { FaxiosInstance } from "#src/index.ts";

// Type-checked by `lint:ts`; the functions are never called.

// A spec-conforming schema with no `~standard.types` field: only `validate` carries the output type.
const typelessUser = {
  "~standard": {
    version: 1 as const,
    vendor: "hand-rolled",
    validate: (value: unknown) => ({ value: value as { id: number; } }),
  },
};

const zUser = z.object({ id: z.number(), name: z.string() });

describe("define() and route() types", () => {
  it("lets a schema-less endpoint take pathParams, params and data", () => {
    function check(instance: FaxiosInstance) {
      void instance.define("get", "/users/{id}")({ pathParams: { id: 1 }, params: { q: "x" } });
      void instance.define("post", "/users")({ data: { name: "a" } });
      void instance.route("/users/{id}").get()({ pathParams: { id: 1 }, params: { q: "x" } });
      void instance.route("/users").post()({ data: { name: "a" } });
    }
    expectTypeOf(check).toBeFunction();
  });

  it("infers the output of a schema with no types field", () => {
    async function check(instance: FaxiosInstance) {
      const defined = await instance.define("get", "/x", { responseSchema: typelessUser })();
      expectTypeOf(defined.data).toEqualTypeOf<{ id: number; }>();
      const routed = await instance.route("/x").get({ responseSchema: typelessUser })();
      expectTypeOf(routed.data).toEqualTypeOf<{ id: number; }>();
      const viaGet = await instance.get("/x", { responseSchema: typelessUser });
      expectTypeOf(viaGet.data).toEqualTypeOf<{ id: number; }>();
    }
    expectTypeOf(check).toBeFunction();
  });

  it("requires pathParams typed from a pathParamsSchema with no types field", () => {
    const typelessPath = {
      "~standard": {
        version: 1 as const,
        vendor: "hand-rolled",
        validate: (value: unknown) => ({ value: value as { id: string; } }),
      },
    };
    function check(instance: FaxiosInstance) {
      const endpoint = instance.define("get", "/users/{id}", { pathParamsSchema: typelessPath });
      expectTypeOf(endpoint).parameters.items.toBeObject();
      expectTypeOf<Parameters<typeof endpoint>["length"]>().toEqualTypeOf<1>();
    }
    expectTypeOf(check).toBeFunction();
  });
});

describe("explicit response generic and responseSchema", () => {
  it("rejects a generic that disagrees with the responseSchema output", () => {
    async function check(instance: FaxiosInstance) {
      // @ts-expect-error TS2769 -- the schema outputs { id, name }, not { nope }
      await instance.get<{ nope: string; }>("/u", { responseSchema: zUser });
      // @ts-expect-error TS2769 -- same on a body method
      await instance.post<{ nope: string; }>("/u", {}, { responseSchema: zUser });
      // @ts-expect-error TS2769 -- same on request()
      await instance.request<{ nope: string; }>({ url: "/u", responseSchema: zUser });
    }
    expectTypeOf(check).toBeFunction();
  });

  it("accepts a generic that matches the responseSchema output", () => {
    async function check(instance: FaxiosInstance) {
      const response = await instance.get<{ id: number; name: string; }>("/u", { responseSchema: zUser });
      expectTypeOf(response.data).toEqualTypeOf<{ id: number; name: string; }>();
    }
    expectTypeOf(check).toBeFunction();
  });
});

describe("env types", () => {
  it("accepts the global fetch, Request and Response", () => {
    function check() {
      void faxios.get("/x", { env: { fetch, Request, Response } });
      faxios.create({ env: { fetch, Request, Response } });
    }
    expectTypeOf(check).toBeFunction();
  });
});
