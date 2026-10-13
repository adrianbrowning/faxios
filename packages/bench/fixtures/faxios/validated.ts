// faxios, validated stage: the endpoint definition carries the shared schemas. faxios checks the
// path and query before dispatch and the parsed body after it.
import faxios from "faxios";
import { userPathSchema, userQuerySchema, userSchema } from "../schemas.ts";
import type { GetUserInput } from "../schemas.ts";
import type { FixtureOptions } from "../types.ts";

export function createValidated({ baseURL, fetch }: FixtureOptions) {
  const api = faxios.create({ baseURL, ...(fetch && { env: { fetch } }) });
  const getUser = api.define("get", "/users/{id}", {
    pathParamsSchema: userPathSchema,
    paramsSchema: userQuerySchema,
    responseSchema: userSchema,
  });
  return {
    async getUser({ path, query, signal }: GetUserInput) {
      const response = await getUser({ pathParams: path, params: query, ...(signal && { signal }) });
      return response.data;
    },
  };
}
