// @ts-self-types="./define.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import type { FaxiosRequestConfig, FaxiosResponse, Method, StringLiteralsOrString } from "../types.js";
import type { StandardSchemaV1 } from "../types/standard-schema.js";
import mergeConfig from "./mergeConfig.js";

type StrippedFields =
  | "data"
  | "method"
  | "params"
  | "paramsSchema"
  | "pathParams"
  | "pathParamsSchema"
  | "requestSchema"
  | "responseSchema"
  | "url";

/** Request config shared by `define()`, `route()` and endpoint calls: everything except `url`, `method`, `pathParams`, `params`, `data` and the schemas. */
export type BasePerCallConfig = Omit<FaxiosRequestConfig, StrippedFields>;

// Read the input and output types from the StandardSchemaV1 type parameters rather than the optional
// `~standard.types` field, so a spec-conforming schema without `types` still infers its output.
type SchemaInput<S> = S extends StandardSchemaV1<infer I, unknown> ? I : never;
type SchemaOutput<S> = S extends StandardSchemaV1<unknown, infer O> ? O : unknown;

/**
 * Config for one call of a defined endpoint. `pathParams`, `params` and `data` are required and typed
 * by their schema when one is set, and optional request config otherwise.
 */
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
    pathParams: SchemaInput<PP>;
  } : Pick<FaxiosRequestConfig, "pathParams">)
  & (P extends StandardSchemaV1 ? { params: SchemaInput<P>; } : Pick<FaxiosRequestConfig, "params">)
  & (D extends StandardSchemaV1 ? { data: SchemaInput<D>; } : Pick<FaxiosRequestConfig, "data">);

/** Config for `define()`: request defaults plus the schemas, which are locked at define time. */
export type DefineConfig<
  PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined = undefined,
  P extends StandardSchemaV1 | undefined = undefined,
  D extends StandardSchemaV1 | undefined = undefined,
  R extends StandardSchemaV1 | undefined = undefined
> = BasePerCallConfig & {
  paramsSchema?: P;
  /**
   * Standard Schema that validates `pathParams` on every call; its output fills the `{key}`
   * placeholders. Makes `pathParams` required per call. A failure rejects with `ERR_BAD_PATH_PARAMS_SCHEMA`.
   */
  pathParamsSchema?: PP;
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
    ? (callConfig: PerCallConfig<PP, P, D, TOpts>) => Promise<FaxiosResponse<SchemaOutput<R>>>
    : (callConfig?: PerCallConfig<PP, P, D, TOpts>) => Promise<FaxiosResponse<SchemaOutput<R>>>;

/** The minimal instance shape `define()` and `route()` need: a `request` method. */
export interface FaxiosLike {
  request: (config: FaxiosRequestConfig) => Promise<FaxiosResponse<unknown>>;
}

type SchemaFields = Extract<StrippedFields, `${string}Schema`>;
const schemaKeys = [ "pathParamsSchema", "paramsSchema", "requestSchema", "responseSchema" ] as const;
// compile-time assertion: schemaKeys and SchemaFields must stay in sync
void (schemaKeys satisfies ReadonlyArray<SchemaFields>);
// strippedKeys strips url/method/schemas from per-call config; pathParams/params/data stay (they're the
// validated data, not the schema definitions), and PerCallConfig types them per schema
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

  // Typed loosely: DefinedEndpoint carries the per-schema call types, this body only copies the config.
  const fn = (callConfig?: FaxiosRequestConfig) => {
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
