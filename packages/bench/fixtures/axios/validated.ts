// Axios, validated stage: the shared schemas check the path and query before the request and the
// parsed body after it. Axios has no schema integration, so the wiring is application code.
import axios from "axios";
import type { z } from "zod";
import { userPathSchema, userQuerySchema, userSchema } from "../schemas.ts";
import type { GetUserInput } from "../schemas.ts";
import type { FixtureOptions } from "../types.ts";

export class ValidationError extends Error {
  readonly issues: ReadonlyArray<z.core.$ZodIssue>;
  readonly target: "path" | "query" | "response";

  constructor(target: "path" | "query" | "response", issues: ReadonlyArray<z.core.$ZodIssue>) {
    super(`Invalid ${target}`);
    this.name = "ValidationError";
    this.target = target;
    this.issues = issues;
  }
}

export function parse<S extends z.ZodType>(schema: S, value: unknown, target: ValidationError["target"]): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(target, result.error.issues);
  return result.data;
}

export function createValidated({ baseURL, fetch }: FixtureOptions) {
  const api = axios.create({ baseURL, adapter: "fetch", ...(fetch && { env: { fetch } }) });
  return {
    async getUser({ path, query, signal }: GetUserInput) {
      const { id } = parse(userPathSchema, path, "path");
      const params = parse(userQuerySchema, query, "query");
      const response = await api.get<unknown>(`/users/${encodeURIComponent(id)}`, { params, signal });
      return parse(userSchema, response.data, "response");
    },
  };
}
