// Native Fetch, validated stage: the shared schemas check the path and query before the request
// and the parsed body after it. The URL building and the error type are application code.
import type { z } from "zod";
import { userPathSchema, userQuerySchema, userSchema } from "../schemas.ts";
import type { GetUserInput } from "../schemas.ts";
import type { FixtureOptions } from "../types.ts";
import { HttpError } from "./basic.ts";

export { HttpError };

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

export function createValidated({ baseURL, fetch = globalThis.fetch }: FixtureOptions) {
  return {
    async getUser({ path, query, signal }: GetUserInput) {
      const { id } = parse(userPathSchema, path, "path");
      const { fields, limit } = parse(userQuerySchema, query, "query");
      const search = new URLSearchParams({ fields, limit: String(limit) });
      const response = await fetch(`${baseURL}/users/${encodeURIComponent(id)}?${search}`, {
        headers: { accept: "application/json" },
        signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new HttpError(response);
      }
      return parse(userSchema, await response.json(), "response");
    },
  };
}
