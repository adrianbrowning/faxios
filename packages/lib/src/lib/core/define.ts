// @ts-self-types="./define.d.ts"
"use strict";

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

export type BasePerCallConfig = Omit<FaxiosRequestConfig, StrippedFields>;

export type PerCallConfig<
  PP extends StandardSchemaV1 | undefined,
  P extends StandardSchemaV1 | undefined,
  D extends StandardSchemaV1 | undefined
> =
  BasePerCallConfig
  & (PP extends StandardSchemaV1 ? { pathParams: StandardSchemaV1.InferInput<PP>; } : unknown)
  & (P extends StandardSchemaV1 ? { params: StandardSchemaV1.InferInput<P>; } : unknown)
  & (D extends StandardSchemaV1 ? { data: StandardSchemaV1.InferInput<D>; } : unknown);

export type DefineConfig<
  PP extends StandardSchemaV1 | undefined = undefined,
  P extends StandardSchemaV1 | undefined = undefined,
  D extends StandardSchemaV1 | undefined = undefined,
  R extends StandardSchemaV1 | undefined = undefined
> = BasePerCallConfig & {
  pathParamsSchema?: PP;
  paramsSchema?: P;
  requestSchema?: D;
  responseSchema?: R;
};

type HasInputSchema<PP, P, D> =
  [PP, P, D] extends [undefined, undefined, undefined] ? false : true;

export type DefinedEndpoint<
  PP extends StandardSchemaV1 | undefined,
  P extends StandardSchemaV1 | undefined,
  D extends StandardSchemaV1 | undefined,
  R extends StandardSchemaV1 | undefined
> =
  HasInputSchema<PP, P, D> extends true
    ? (callConfig: PerCallConfig<PP, P, D>) => Promise<FaxiosResponse<R extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<R> : unknown>>
    : (callConfig?: PerCallConfig<PP, P, D>) => Promise<FaxiosResponse<R extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<R> : unknown>>;

interface FaxiosLike {
  request: (config: FaxiosRequestConfig) => Promise<unknown>;
}

const schemaKeys = [ "pathParamsSchema", "paramsSchema", "requestSchema", "responseSchema" ] as const;

export function createDefinedEndpoint<
  PP extends StandardSchemaV1 | undefined,
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
    // ponytail: runtime guard — strip endpoint identity so JS callers can't override
    delete (safeCall as Record<string, unknown>)["url"];
    delete (safeCall as Record<string, unknown>)["method"];

    // mergeConfig(baked, perCall): perCall wins for most fields (signal, headers, timeout, env)
    const merged = mergeConfig(bakedConfig, safeCall);
    // Lock url/method and re-lock schemas — perCall cannot override define-time identity
    (merged as Record<string, unknown>)["url"] = url;
    (merged as Record<string, unknown>)["method"] = method;
    for (const k of schemaKeys) {
      if (bakedConfig[k] !== undefined) (merged as Record<string, unknown>)[k] = bakedConfig[k];
    }

    return instance.request(merged);
  };

  return fn as unknown as DefinedEndpoint<PP, P, D, R>;
}
