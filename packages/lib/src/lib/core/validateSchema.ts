import isCancel from "../cancel/isCancel.js";
import type { StandardSchemaV1 } from "../types/standard-schema.js";
import type { InternalFaxiosRequestConfig, FaxiosResponse } from "../types.js";
import FaxiosError from "./FaxiosError.js";

type SchemaErrorCode =
  | typeof FaxiosError.ERR_BAD_RESPONSE_SCHEMA
  | typeof FaxiosError.ERR_BAD_REQUEST_SCHEMA
  | typeof FaxiosError.ERR_BAD_PARAMS_SCHEMA
  | typeof FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA;

export async function validateSchema<S extends StandardSchemaV1>(
  schema: S,
  value: unknown,
  errorCode: SchemaErrorCode,
  config: InternalFaxiosRequestConfig,
  response?: FaxiosResponse
): Promise<StandardSchemaV1.InferOutput<S>> {
  let result: StandardSchemaV1.Result<unknown> | undefined;
  try {
    const raw = schema["~standard"].validate(value);
    result = raw instanceof Promise ? await raw : raw;
  }
  catch (err) {
    if (isCancel(err)) throw err;
    const wrapped = FaxiosError.from(
      err instanceof Error ? err : new Error(String(err)),
      errorCode, config, undefined, response
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
    // Strip to spec-only fields — runtime libs may attach sensitive data
    error.issues = result.issues.map(({ message, path }) => path ? { message, path } : { message });
    throw error;
  }
  // Standard Schema spec guarantees Result.value aligns with InferOutput
  return result.value;
}
