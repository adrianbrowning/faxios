import { describe, it, expectTypeOf } from "vitest";
import type { FaxiosResponse, StandardSchemaV1 } from "#src/index.ts";
import { FaxiosError, isSchemaValidationError } from "#src/index.ts";
import type { FaxiosInstance } from "#src/lib/faxios.ts";

type UserOutput = { name: string; age: number; };
type UserSchema = StandardSchemaV1<unknown, UserOutput>;

describe("responseSchema type inference", () => {
  it("infers response.data from schema output type on get()", () => {
    async function check(instance: FaxiosInstance, schema: UserSchema) {
      const response = await instance.get("/url", { responseSchema: schema });
      expectTypeOf(response.data).toEqualTypeOf<UserOutput>();
    }
    expectTypeOf(check).toBeFunction();
  });

  it("preserves manual generic when no responseSchema", () => {
    async function check(instance: FaxiosInstance) {
      const response = await instance.get<{ id: number; }>("/url");
      expectTypeOf(response.data).toEqualTypeOf<{ id: number; }>();
    }
    expectTypeOf(check).toBeFunction();
  });

  it("infers response.data from schema output type on post()", () => {
    async function check(instance: FaxiosInstance, schema: UserSchema) {
      const response = await instance.post("/url", {}, { responseSchema: schema });
      expectTypeOf(response.data).toEqualTypeOf<UserOutput>();
    }
    expectTypeOf(check).toBeFunction();
  });

  it("defaults to unknown when no generic and no schema", () => {
    async function check(instance: FaxiosInstance) {
      const response = await instance.get("/url");
      expectTypeOf(response.data).toEqualTypeOf<unknown>();
    }
    expectTypeOf(check).toBeFunction();
  });

  it("isSchemaValidationError narrows to FaxiosError with issues and a schema code", () => {
    function check(err: unknown) {
      if (isSchemaValidationError(err)) {
        expectTypeOf(err.issues).toEqualTypeOf<ReadonlyArray<StandardSchemaV1.Issue>>();
        expectTypeOf(err.code).toEqualTypeOf<
          "ERR_BAD_RESPONSE_SCHEMA" | "ERR_BAD_REQUEST_SCHEMA" | "ERR_BAD_PARAMS_SCHEMA" | "ERR_BAD_PATH_PARAMS_SCHEMA"
        >();
      }
    }
    expectTypeOf(check).toBeFunction();
  });

  it("ERR_BAD_RESPONSE_SCHEMA narrows response to required with unvalidated data", () => {
    function check(err: unknown) {
      if (isSchemaValidationError(err) && err.code === FaxiosError.ERR_BAD_RESPONSE_SCHEMA) {
        expectTypeOf(err.response).toEqualTypeOf<FaxiosResponse>();
        expectTypeOf(err.response.data).toEqualTypeOf<unknown>();
      }
    }
    expectTypeOf(check).toBeFunction();
  });

  it("input schema codes leave response optional", () => {
    function check(err: unknown) {
      if (isSchemaValidationError(err) && err.code !== FaxiosError.ERR_BAD_RESPONSE_SCHEMA) {
        expectTypeOf(err.response).toEqualTypeOf<FaxiosResponse | undefined>();
      }
    }
    expectTypeOf(check).toBeFunction();
  });
});
