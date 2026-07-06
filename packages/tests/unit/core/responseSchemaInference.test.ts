import { describe, it, expectTypeOf } from "vitest";
import type { StandardSchemaV1 } from "#src/index.ts";
import { isSchemaValidationError } from "#src/index.ts";
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

  it("isSchemaValidationError narrows to FaxiosError with issues", () => {
    function check(err: unknown) {
      if (isSchemaValidationError(err)) {
        expectTypeOf(err.issues).toEqualTypeOf<ReadonlyArray<StandardSchemaV1.Issue>>();
        expectTypeOf(err.code).toEqualTypeOf<string | undefined>();
      }
    }
    expectTypeOf(check).toBeFunction();
  });
});
