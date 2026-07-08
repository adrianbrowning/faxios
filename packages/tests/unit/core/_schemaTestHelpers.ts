import type { StandardSchemaV1 } from "#src/lib/types/standard-schema.js";

export const mockFetch = (body: unknown, status = 200) =>
  async () => new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export function makeSchema<T>(validate: StandardSchemaV1<unknown, T>["~standard"]["validate"]): StandardSchemaV1<unknown, T> {
  return { "~standard": { version: 1, vendor: "test", validate } };
}

