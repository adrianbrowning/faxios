// @ts-self-types="./route.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import type { StandardSchemaV1 } from "../types/standard-schema.js";
import type { ParamsSchema } from "../types.js";
import type { BasePerCallConfig, DefineConfig, DefinedEndpoint, FaxiosLike } from "./define.js";
import { createDefinedEndpoint } from "./define.js";

export type RouteConfig<PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined = undefined> =
  BasePerCallConfig & { pathParamsSchema?: PP; };

export type RouteMethodConfig<
  P extends ParamsSchema | undefined = undefined,
  D extends StandardSchemaV1 | undefined = undefined,
  R extends StandardSchemaV1 | undefined = undefined
> = BasePerCallConfig & {
  paramsSchema?: P;
  requestSchema?: D;
  responseSchema?: R;
};

export type RouteBuilder<PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined> = {
  [M in "get" | "post" | "put" | "patch" | "delete" | "head" | "options"]: <
    P extends ParamsSchema | undefined = undefined,
    D extends StandardSchemaV1 | undefined = undefined,
    R extends StandardSchemaV1 | undefined = undefined
  >(config?: RouteMethodConfig<P, D, R>) => DefinedEndpoint<PP, P, D, R>;
};

// ponytail: `query` excluded — non-standard HTTP method alias, not useful in route definitions
const methods = [ "get", "post", "put", "patch", "delete", "head", "options" ] as const satisfies ReadonlyArray<keyof RouteBuilder<undefined>>;

export function createRouteBuilder<PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined>(
  instance: FaxiosLike,
  url: string,
  routeConfig?: RouteConfig<PP>
): RouteBuilder<PP> {
  const raw = Object.assign(Object.create(null), routeConfig ?? {});
  delete raw.__proto__;
  delete raw.constructor;
  delete raw.prototype;
  const { pathParamsSchema, ...routeDefaults } = raw;

  const builder = {} as RouteBuilder<PP>;
  for (const method of methods) {
    (builder as Record<string, unknown>)[method] = <
      P extends ParamsSchema | undefined,
      D extends StandardSchemaV1 | undefined,
      R extends StandardSchemaV1 | undefined
    >(methodConfig?: RouteMethodConfig<P, D, R>) => {
      const defineConf = {
        ...routeDefaults,
        ...(methodConfig ?? {}),
        ...(pathParamsSchema !== undefined ? { pathParamsSchema } : {}),
      } as DefineConfig<PP, P, D, R>;
      return createDefinedEndpoint<PP, P, D, R>(instance, method, url, defineConf);
    };
  }
  return builder;
}
