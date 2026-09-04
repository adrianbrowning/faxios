import { describe, it, expectTypeOf } from "vitest";
import faxios from "#src/index.ts";
import type { FaxiosParams, FaxiosRequestConfig, ParamsSchema } from "#src/index.ts";
import { makeSchema } from "./_schemaTestHelpers.js";

// Type-level only. These assertions are enforced by `pnpm lint:ts`
// (tsc -p tsconfig.check.json), not by the vitest runtime.
describe("paramsSchema output type", () => {
  it("accepts a schema whose output is a params record", () => {
    const schema = makeSchema<{ q: string; }>(v => ({ value: v as { q: string; } }));
    const config: FaxiosRequestConfig = { paramsSchema: schema };
    expectTypeOf(config.paramsSchema).not.toBeNever();
  });

  it("accepts a schema whose output is URLSearchParams", () => {
    const schema = makeSchema<URLSearchParams>(() => ({ value: new URLSearchParams() }));
    const config: FaxiosRequestConfig = { paramsSchema: schema };
    expectTypeOf(config.paramsSchema).not.toBeNever();
  });

  it("rejects a schema whose output cannot be serialized as params", () => {
    const schema = makeSchema<string>(() => ({ value: "not-params" }));
    const config: FaxiosRequestConfig = {
      // @ts-expect-error — paramsSchema output must be assignable to config.params
      paramsSchema: schema,
    };
    expectTypeOf(config.paramsSchema).not.toBeNever();
  });

  it("define() rejects a paramsSchema whose output cannot be serialized as params", () => {
    const schema = makeSchema<string>(() => ({ value: "not-params" }));
    const endpoint = faxios.define("GET", "http://localhost/search", {
      // @ts-expect-error — paramsSchema output must be assignable to config.params
      paramsSchema: schema,
    });
    expectTypeOf(endpoint).toBeFunction();
  });

  it("route() rejects a paramsSchema whose output cannot be serialized as params", () => {
    const schema = makeSchema<string>(() => ({ value: "not-params" }));
    const endpoint = faxios.route("http://localhost/search").get({
      // @ts-expect-error — paramsSchema output must be assignable to config.params
      paramsSchema: schema,
    });
    expectTypeOf(endpoint).toBeFunction();
  });

  it("exposes FaxiosParams and ParamsSchema so consumers can name the contract", () => {
    const wrap = (schema: ParamsSchema): FaxiosRequestConfig => ({ paramsSchema: schema });
    const config = wrap(makeSchema<FaxiosParams>(v => ({ value: v as FaxiosParams })));
    expectTypeOf(config.paramsSchema).toEqualTypeOf<ParamsSchema | undefined>();
  });
});
