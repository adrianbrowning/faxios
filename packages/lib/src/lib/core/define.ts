// @ts-self-types="./define.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import type { StandardSchemaV1 } from "../types/standard-schema.js";
import type { FaxiosRequestConfig, FaxiosResponse, StringLiteralsOrString, Method } from "../types.js";
import mergeConfig from "./mergeConfig.js";

type StrippedFields =
  | "url"
  | "method"
  | "pathParams"
  | "params"
  | "data"
  | "pathParamsSchema"
  | "paramsSchema"
  | "requestSchema"
  | "responseSchema";

/** Request config accepted by a defined endpoint call: everything except `url`, `method`, `pathParams`, `params`, `data` and the schemas. */
export type BasePerCallConfig = Omit<FaxiosRequestConfig, StrippedFields>;

/** Config for one call of a defined endpoint; `pathParams`, `params` and `data` are required when their schema is set. */
export type PerCallConfig<
  PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined,
  P extends StandardSchemaV1 | undefined,
  D extends StandardSchemaV1 | undefined,
  TOpts = unknown
> =
  BasePerCallConfig
  & TOpts
  & (PP extends StandardSchemaV1 ? {
    /**
     * Values for `{key}` placeholders in the endpoint URL (braces, not `:key`), validated by the
     * endpoint's `pathParamsSchema` first. Each value goes through `String()` then
     * `encodeURIComponent`; a missing, `null` or `undefined` value rejects with
     * `ERR_BAD_OPTION_VALUE`, and a schema failure with `ERR_BAD_PATH_PARAMS_SCHEMA`.
     * Keys with no matching placeholder are ignored.
     */
    pathParams: StandardSchemaV1.InferInput<PP>;
  } : unknown)
  & (P extends StandardSchemaV1 ? { params: StandardSchemaV1.InferInput<P>; } : unknown)
  & (D extends StandardSchemaV1 ? { data: StandardSchemaV1.InferInput<D>; } : unknown);

/** Config for `define()`: request defaults plus the schemas, which are locked at define time. */
export type DefineConfig<
  PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined = undefined,
  P extends StandardSchemaV1 | undefined = undefined,
  D extends StandardSchemaV1 | undefined = undefined,
  R extends StandardSchemaV1 | undefined = undefined
> = BasePerCallConfig & {
  /**
   * Standard Schema that validates `pathParams` on every call; its output fills the `{key}`
   * placeholders. Makes `pathParams` required per call. A failure rejects with `ERR_BAD_PATH_PARAMS_SCHEMA`.
   */
  pathParamsSchema?: PP;
  paramsSchema?: P;
  requestSchema?: D;
  responseSchema?: R;
};

type HasInputSchema<PP, P, D> =
  [PP, P, D] extends [undefined, undefined, undefined] ? false : true;

/** The function `define()` returns: call it with per-call config to send the request. */
export type DefinedEndpoint<
  PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined,
  P extends StandardSchemaV1 | undefined,
  D extends StandardSchemaV1 | undefined,
  R extends StandardSchemaV1 | undefined,
  TOpts = unknown
> =
  HasInputSchema<PP, P, D> extends true
    ? (callConfig: PerCallConfig<PP, P, D, TOpts>) => Promise<FaxiosResponse<R extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<R> : unknown>>
    : (callConfig?: PerCallConfig<PP, P, D, TOpts>) => Promise<FaxiosResponse<R extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<R> : unknown>>;

/** The minimal instance shape `define()` and `route()` need: a `request` method. */
export interface FaxiosLike {
  request: (config: FaxiosRequestConfig) => Promise<FaxiosResponse<unknown>>;
}

type SchemaFields = Extract<StrippedFields, `${string}Schema`>;
const schemaKeys = [ "pathParamsSchema", "paramsSchema", "requestSchema", "responseSchema" ] as const;
// compile-time assertion: schemaKeys and SchemaFields must stay in sync
void (schemaKeys satisfies ReadonlyArray<SchemaFields>);
// strippedKeys strips url/method/schemas from per-call config; StrippedFields also omits pathParams/params/data
// at the type level (those are still allowed at runtime — they're the validated data, not the schema definitions)
const strippedKeys = [ "url", "method", ...schemaKeys ] as const;

export function createDefinedEndpoint<
  PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined,
  P extends StandardSchemaV1 | undefined,
  D extends StandardSchemaV1 | undefined,
  R extends StandardSchemaV1 | undefined
>(
  instance: FaxiosLike,
  method: StringLiteralsOrString<Method>,
  url: string,
  defineConfig?: DefineConfig<PP, P, D, R>
): DefinedEndpoint<PP, P, D, R> {
  const bakedConfig: FaxiosRequestConfig = { ...(defineConfig ?? {}), method, url };

  const fn = (callConfig?: PerCallConfig<PP, P, D>) => {
    const safeCall: FaxiosRequestConfig = { ...(callConfig ?? {}) };
    // ponytail: runtime guard — strip identity + schemas so JS callers can't override
    for (const k of strippedKeys) {
      delete (safeCall as Record<string, unknown>)[k];
    }

    // mergeConfig(baked, perCall): perCall wins for most fields (signal, headers, timeout, env)
    const merged = mergeConfig(bakedConfig, safeCall);
    // Lock url/method and re-lock schemas — perCall cannot override define-time identity
    (merged as Record<string, unknown>)["url"] = url;
    (merged as Record<string, unknown>)["method"] = method;
    // ponytail: defense-in-depth — mergeConfig would fall through, but this makes the invariant explicit
    for (const k of schemaKeys) {
      if (Object.prototype.hasOwnProperty.call(bakedConfig, k)) {
        (merged as Record<string, unknown>)[k] = bakedConfig[k];
      }
      else {
        delete (merged as Record<string, unknown>)[k];
      }
    }

    return instance.request(merged);
  };

  return fn as DefinedEndpoint<PP, P, D, R>;
}
