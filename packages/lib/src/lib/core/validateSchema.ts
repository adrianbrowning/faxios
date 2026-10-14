import isCancel from "../cancel/isCancel.js";
import type { FaxiosResponse, InternalFaxiosRequestConfig } from "../types.js";
import type { StandardSchemaV1 } from "../types/standard-schema.js";
import FaxiosError from "./FaxiosError.js";

type SchemaErrorCode =
  | typeof FaxiosError.ERR_BAD_PARAMS_SCHEMA
  | typeof FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA
  | typeof FaxiosError.ERR_BAD_REQUEST_SCHEMA
  | typeof FaxiosError.ERR_BAD_RESPONSE_SCHEMA;

export async function validateSchema<S extends StandardSchemaV1>(
  schema: S,
  value: unknown,
  errorCode: SchemaErrorCode,
  config: InternalFaxiosRequestConfig,
  response?: FaxiosResponse
): Promise<StandardSchemaV1.InferOutput<S>> {
  let result: StandardSchemaV1.Result<unknown> | undefined;
  try {
    // Awaited unconditionally: a Promise from another realm fails `instanceof Promise`.
    result = await schema["~standard"].validate(value);
  }
  catch (err) {
    if (isCancel(err)) throw err;
    const cause = err instanceof Error ? err : new Error(String(err), { cause: err });
    const wrapped = FaxiosError.from(
      cause, errorCode, config, undefined, response
    );
    wrapped.issues = [{ message: wrapped.message }];
    throw wrapped;
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!result) {
    const error = new FaxiosError(
      `schema['~standard'].validate() returned a non-Result value`,
      errorCode, config, undefined, response
    );
    error.issues = [];
    throw error;
  }
  if (result.issues !== undefined) {
    const error = new FaxiosError(
      "Schema validation failed",
      errorCode, config, undefined, response
    );
    // Strip to spec-only fields: runtime libs attach the rejected value to an issue, and Valibot
    // also to each path segment (`{ type, origin, input, key, value }`), so a segment keeps only `key`.
    error.issues = result.issues.map(({ message, path }) => path
      ? { message, path: path.map(segment => (typeof segment === "object" ? { key: segment.key } : segment)) }
      : { message });
    throw error;
  }
  // Standard Schema spec guarantees Result.value aligns with InferOutput
  return result.value;
}
