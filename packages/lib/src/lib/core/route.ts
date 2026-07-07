// @ts-self-types="./route.d.ts"

import type { StandardSchemaV1 } from "../types/standard-schema.js";
import type { FaxiosRequestConfig, FaxiosResponse } from "../types.js";
import type { BasePerCallConfig, DefineConfig, DefinedEndpoint } from "./define.js";
import { createDefinedEndpoint } from "./define.js";

export type RouteConfig<PP extends StandardSchemaV1 | undefined = undefined> =
  BasePerCallConfig & { pathParamsSchema?: PP; };

export type RouteMethodConfig<
  P extends StandardSchemaV1 | undefined = undefined,
  D extends StandardSchemaV1 | undefined = undefined,
  R extends StandardSchemaV1 | undefined = undefined
> = BasePerCallConfig & {
  paramsSchema?: P;
  requestSchema?: D;
  responseSchema?: R;
};

export type RouteBuilder<PP extends StandardSchemaV1 | undefined> = {
  [M in "get" | "post" | "put" | "patch" | "delete" | "head" | "options"]: <
    P extends StandardSchemaV1 | undefined = undefined,
    D extends StandardSchemaV1 | undefined = undefined,
    R extends StandardSchemaV1 | undefined = undefined
  >(config?: RouteMethodConfig<P, D, R>) => DefinedEndpoint<PP, P, D, R>;
};

interface FaxiosLike {
  request: (config: FaxiosRequestConfig) => Promise<FaxiosResponse<unknown>>;
}

const methods = [ "get", "post", "put", "patch", "delete", "head", "options" ] as const;

export function createRouteBuilder<PP extends StandardSchemaV1 | undefined>(
  instance: FaxiosLike,
  url: string,
  routeConfig?: RouteConfig<PP>
): RouteBuilder<PP> {
  const { pathParamsSchema, ...routeDefaults } = (routeConfig ?? {});

  const builder = {} as RouteBuilder<PP>;
  for (const method of methods) {
    (builder as Record<string, unknown>)[method] = <
      P extends StandardSchemaV1 | undefined,
      D extends StandardSchemaV1 | undefined,
      R extends StandardSchemaV1 | undefined
    >(methodConfig?: RouteMethodConfig<P, D, R>) => {
      const defineConf = {
        ...routeDefaults,
        ...(methodConfig ?? {}),
        pathParamsSchema,
      } as DefineConfig<PP, P, D, R>;
      return createDefinedEndpoint<PP, P, D, R>(instance, method, url, defineConf);
    };
  }
  return builder;
}
