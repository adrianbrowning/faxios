// @ts-self-types="./route.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import type { StandardSchemaV1 } from "../types/standard-schema.js";
import type { BasePerCallConfig, DefineConfig, DefinedEndpoint, FaxiosLike } from "./define.js";
import { createDefinedEndpoint } from "./define.js";

/** Config for `route()`: request defaults shared by every method, plus an optional `pathParamsSchema`. */
export type RouteConfig<PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined = undefined> =
  BasePerCallConfig & {
    /**
     * Standard Schema that validates `pathParams` on every call of every method's endpoint; its
     * output fills the `{key}` placeholders. Makes `pathParams` required per call, and a method's
     * config can't replace it. A failure rejects with `ERR_BAD_PATH_PARAMS_SCHEMA`.
     */
    pathParamsSchema?: PP;
  };

/** Config for one method of a route; merged over the route config. */
export type RouteMethodConfig<
  P extends StandardSchemaV1 | undefined = undefined,
  D extends StandardSchemaV1 | undefined = undefined,
  R extends StandardSchemaV1 | undefined = undefined
> = BasePerCallConfig & {
  paramsSchema?: P;
  requestSchema?: D;
  responseSchema?: R;
};

/** The object `route()` returns: one endpoint factory per HTTP method (no `query`). */
export type RouteBuilder<PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined, TOpts = unknown> = {
  [M in "get" | "post" | "put" | "patch" | "delete" | "head" | "options"]: <
    P extends StandardSchemaV1 | undefined = undefined,
    D extends StandardSchemaV1 | undefined = undefined,
    R extends StandardSchemaV1 | undefined = undefined
  >(config?: RouteMethodConfig<P, D, R> & TOpts) => DefinedEndpoint<PP, P, D, R, TOpts>;
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
      P extends StandardSchemaV1 | undefined,
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
