// @ts-self-types="./schema.d.ts" — required for Deno: src/schema.ts re-exports schema from here
// The schema feature: validates pathParamsSchema, paramsSchema, requestSchema and responseSchema
// at their fixed places in dispatch.

import FaxiosError from "../core/FaxiosError.js";
import { defineFeature } from "../core/features.js";
import { fillPathParams, throwIfCancellationRequested } from "../core/preFlight.js";
import { validateSchema } from "../core/validateSchema.js";
import type { FaxiosFeaturePlugin, FaxiosResponse, InternalFaxiosRequestConfig } from "../types.js";

async function validateAndSubstitutePathParams(config: InternalFaxiosRequestConfig): Promise<void> {
  if (config.pathParamsSchema) {
    const validated = await validateSchema(
      config.pathParamsSchema, config.pathParams,
      FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA, config
    );
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard: schema can return { value: null }
    if (validated == null) {
      throw new FaxiosError(
        "pathParamsSchema returned null/undefined",
        FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA, config
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, sonarjs/different-types-comparison -- runtime guard: schema may transform to non-Record
    if (typeof validated !== "object" || validated === null || Array.isArray(validated)) {
      throw new FaxiosError(
        "pathParamsSchema must return a plain object",
        FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA, config
      );
    }
    config.pathParams = validated;
  }
  fillPathParams(config);
}

// Intentional mutation: config is the internal merged copy (post-mergeConfig), not the user's original.
// Validation order (pathParams → params → data) is a fail-fast guarantee — do not reorder.
// DO NOT make this function async. Returning undefined (not a Promise) on the fast path is a
// microtask-ordering contract: dispatchRequest must reach the adapter in the same microtask so
// that a synchronous controller.abort() after request creation is processed by the adapter's
// signal listener, not before it registers. An async function always returns a Promise, inserting
// a microtask boundary that breaks abort timing in fetch adapter tests and real-world usage.
function preFlight(config: InternalFaxiosRequestConfig): Promise<void> | undefined {
  if (config.pathParamsSchema && config.pathParams === undefined) {
    throw new FaxiosError(
      "pathParams is required when pathParamsSchema is configured",
      FaxiosError.ERR_BAD_OPTION_VALUE, config
    );
  }

  const hasSchemas = config.pathParamsSchema || config.paramsSchema || config.requestSchema;
  if (!hasSchemas && config.pathParams === undefined) return undefined;

  // pathParams present but no schemas — substitute synchronously, no microtask boundary needed.
  if (!hasSchemas) {
    fillPathParams(config);
    return undefined;
  }

  return (async () => {
    if (config.pathParams !== undefined) {
      await validateAndSubstitutePathParams(config);
    }

    if (config.paramsSchema) {
      throwIfCancellationRequested(config);
      config.params = await validateSchema(config.paramsSchema, config.params, FaxiosError.ERR_BAD_PARAMS_SCHEMA, config) as typeof config.params;
    }

    if (config.requestSchema) {
      throwIfCancellationRequested(config);
      config.data = await validateSchema(config.requestSchema, config.data, FaxiosError.ERR_BAD_REQUEST_SCHEMA, config);
    }
  })();
}

function checkResponse(config: InternalFaxiosRequestConfig, response: FaxiosResponse): Promise<FaxiosResponse> {
  return validateSchema(config.responseSchema!, response.data, FaxiosError.ERR_BAD_RESPONSE_SCHEMA, config, response)
    .then(data => { response.data = data; throwIfCancellationRequested(config); return response; });
}

/**
 * Validates requests and responses with the Standard Schemas in `pathParamsSchema`,
 * `paramsSchema`, `requestSchema` and `responseSchema`, and types `responseSchema`'s output as the
 * response data. Install it with `use()` on an instance from `@gcmdev/faxios/core`; the root entry
 * installs it on every instance. Without it, those options reject with `ERR_BAD_OPTION`.
 */
export function schema(): FaxiosFeaturePlugin<"schema"> {
  return defineFeature("schema", { checkResponse, preFlight });
}
