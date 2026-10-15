// @ts-self-types="./faxios.d.ts"
"use strict";

import CanceledError from "./cancel/CanceledError.js";
import isCancel from "./cancel/isCancel.js";
import type { DefineConfig, DefinedEndpoint } from "./core/define.js";
import Faxios from "./core/Faxios.js";
import FaxiosError from "./core/FaxiosError.js";
import FaxiosHeaders from "./core/FaxiosHeaders.js";
import mergeConfig from "./core/mergeConfig.js";
import type { RouteBuilder, RouteConfig } from "./core/route.js";
import { create, defaultContext } from "./create.js";
import { createInstance } from "./createInstance.js";
import defaults from "./defaults/index.js";
import { VERSION } from "./env/data.js";
import { all } from "./helpers/all.js";
import { formToJSON } from "./helpers/formToJSON.js";
import HttpStatusCode from "./helpers/HttpStatusCode.js";
import isFaxiosError from "./helpers/isFaxiosError.js";
import toFormData from "./helpers/toFormData.js";
import type { CreateFaxiosDefaults, FaxiosDefaults, FaxiosHeaderValue, FaxiosMiddleware, FaxiosPluginArgument, FaxiosRequestConfig, FaxiosResponse, HeadersDefaults, Method, ResponseTypedConfig, SchemaConfig, StringLiteralsOrString } from "./types.js";
import type { StandardSchemaV1 } from "./types/standard-schema.js";
import type { WebURL } from "./types/web.js";

// Keys of TNeed that THave lacks, or provides with an incompatible type.
type MissingCapabilities<THave, TNeed> = {
  [K in keyof TNeed]: K extends keyof THave ? (THave[K] extends TNeed[K] ? never : K) : K;
}[keyof TNeed];

// `unknown` when THave satisfies TNeed; otherwise a required brand property whose name explains
// the fix and whose value names the missing capabilities, so the compiler error points at them.
type RequireCapabilities<THave, TNeed> = [MissingCapabilities<THave, TNeed>] extends [never]
  ? unknown
  : { "faxios: install a plugin that provides this capability first": MissingCapabilities<THave, TNeed>; };

// Capabilities TProv would provide that THave already has. use() throws ERR_BAD_OPTION for these at
// runtime, so they are a type error too.
type DuplicateCapabilities<THave, TProv> = Extract<keyof TProv, keyof THave>;

type RejectDuplicateCapabilities<THave, TProv> = [DuplicateCapabilities<THave, TProv>] extends [never]
  ? unknown
  : { "faxios: another installed plugin already provides this capability": DuplicateCapabilities<THave, TProv>; };

// A plugin that adds capabilities must carry them, however TProv was supplied (inferred, annotated
// or as an explicit type argument), so use() can't record a capability ctx.capabilities lacks.
// NoInfer: TypeScript infers into conditional branches, and this branch must stay a check only.
type RequireProvidesValue<TProv> = [keyof TProv] extends [never] ? unknown : { provides: NoInfer<TProv>; };

// use() skips a nullish provides, so it adds no capabilities. Without this, `provides: undefined`
// infers TProv as undefined and `TCaps & undefined` collapses to never, which satisfies every check.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no capabilities, as in FaxiosInstance
type ProvidedCapabilities<TProv> = [TProv] extends [null | undefined] ? {} : TProv;

// use() reads capability names with Object.keys() and skips the keys that could pollute a prototype,
// so the registry only holds string names. A symbol, number or dangerous key would be typed on
// ctx.capabilities without matching a registered name, and nothing could satisfy a requirement for one.
type UnsupportedCapabilityKeys<TCaps> = Extract<keyof TCaps, "__proto__" | "constructor" | "prototype" | number | symbol>;

type RejectUnsupportedCapabilityKeys<TReq, TProv> = [UnsupportedCapabilityKeys<TProv> | UnsupportedCapabilityKeys<TReq>] extends [never]
  ? unknown
  : { "faxios: capability names must be strings other than __proto__, constructor and prototype": UnsupportedCapabilityKeys<TProv> | UnsupportedCapabilityKeys<TReq>; };

// Nothing sets a plugin option for the caller, so a required one would be typed as present in the
// plugin's middleware while every request that omits it leaves it undefined.
type RequiredOptions<TOpt> = { [K in keyof TOpt]-?: object extends Pick<TOpt, K> ? never : K; }[keyof TOpt];

type RequireOptionalOptions<TOpt> = [RequiredOptions<TOpt>] extends [never]
  ? unknown
  : { "faxios: plugin request options must be optional": RequiredOptions<TOpt>; };

type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (value: infer I) => void ? I : never;
type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true;

// keyof a union holds only the keys every member shares, so a union of capability maps would check
// nothing. Which member applies can't be known, so a union is rejected.
type RejectUnionCapabilities<TReq, TProv> = IsUnion<TReq> extends true
  ? { "faxios: a plugin's required capabilities can't be a union": TReq; }
  : IsUnion<TProv> extends true ? { "faxios: a plugin's provided capabilities can't be a union": TProv; } : unknown;

type CheckPlugin<THave, TReq, TProv, TOpt> = RequireCapabilities<THave, TReq>
  & RejectDuplicateCapabilities<THave, TProv>
  & RequireProvidesValue<TProv>
  & RejectUnsupportedCapabilityKeys<TReq, TProv>
  & RequireOptionalOptions<TOpt>
  & RejectUnionCapabilities<TReq, TProv>;

/**
 * A faxios instance. `TOpts` holds the request options that installed plugins add to every
 * config-taking member; `TCaps` holds the capabilities installed plugins provide.
 */
// `{}` defaults: no plugin options or capabilities yet. Middleware written inline in use() is typed
// from these, so it can use `Object.keys(ctx.capabilities)` or `"name" in ctx.capabilities`
// without narrowing first.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- see above
export type FaxiosInstance<TOpts = {}, TCaps = {}> = {
  /**
   * Define a typed endpoint for `method` and `url` (with optional `{key}` placeholders). `config`
   * holds request defaults and the `pathParamsSchema`, `paramsSchema`, `requestSchema` and
   * `responseSchema` to apply; schemas are locked at define time. Per-call `url`, `method` and
   * schemas are ignored, and `pathParams`, `params` and `data` are required when their schema is set.
   * The endpoint is a plain function that sends through this instance, so add middleware with
   * `.use()` on the instance, not on the endpoint.
   */
  define: <
    PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined = undefined,
    P extends StandardSchemaV1 | undefined = undefined,
    D extends StandardSchemaV1 | undefined = undefined,
    R extends StandardSchemaV1 | undefined = undefined
  >(
    method: StringLiteralsOrString<Method>,
    url: string,
    config?: DefineConfig<PP, P, D, R> & TOpts
  ) => DefinedEndpoint<PP, P, D, R, TOpts>;
  /**
   * Remove middleware or a plugin registered with use(), by reference. In-flight requests are
   * unaffected. The instance type is not narrowed: request options and capabilities the ejected
   * plugin added stay in its type.
   */
  // A method, so its parameter is checked bivariantly: middleware typed for this instance's
  // options and capabilities is accepted.
  // eslint-disable-next-line @typescript-eslint/method-signature-style -- see above
  eject<TReq = unknown, TProv = unknown, TOpt = unknown>(middleware: FaxiosMiddleware<TOpt> | FaxiosPluginArgument<TReq, TProv, TOpt>): void;
  /**
   * Group endpoints that share `url` and `config`. Returns one endpoint factory per method (`get`,
   * `post`, `put`, `patch`, `delete`, `head`, `options`; no `query`), each taking `paramsSchema`,
   * `requestSchema`, `responseSchema` and request defaults like `define()`. The route-level
   * `pathParamsSchema` applies to every method and wins over a method's. Endpoints are plain
   * functions that send through this instance, so add middleware with `.use()` on the instance.
   */
  route: <PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined = undefined>(
    url: string,
    config?: RouteConfig<PP> & TOpts
  ) => RouteBuilder<PP, TOpts>;
  /**
   * Register middleware or a plugin and return this instance, typed with the plugin's request
   * options and capabilities added. A plugin whose required capabilities aren't installed yet, or
   * that provides a capability another installed plugin already provides, is a type error.
   */
  use: <TReq = unknown, TProv = unknown, TOpt = unknown>(
    middleware: FaxiosMiddleware<TOpts, TCaps> | (FaxiosPluginArgument<TReq, TProv, TOpt> & CheckPlugin<TCaps, TReq, TProv, TOpt>)
  ) => FaxiosInstance<TOpts & TOpt, TCaps & ProvidedCapabilities<TProv>>;
  <O, D = unknown>(config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
  <O, D = unknown>(url: string | WebURL, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
  <T = unknown, D = unknown>(config: ResponseTypedConfig<T, D> & TOpts): Promise<FaxiosResponse<T, D>>;
  <T = unknown, D = unknown>(url: string | WebURL, config?: ResponseTypedConfig<T, D> & TOpts): Promise<FaxiosResponse<T, D>>;
  create: (instanceConfig?: CreateFaxiosDefaults) => FaxiosInstance;
  // `common` plus one header group per method; a key set directly on
  // `headers` applies to every method.
  defaults: Omit<FaxiosDefaults, "headers"> & {
    headers: HeadersDefaults & { [key: string]: FaxiosHeaderValue | undefined; };
  } & Partial<TOpts>;
  delete: {
    <O, D = unknown>(url: string | WebURL, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, D = unknown>(url: string | WebURL, config?: ResponseTypedConfig<T, D> & TOpts): Promise<FaxiosResponse<T, D>>;
  };
  get: {
    <O, D = unknown>(url: string | WebURL, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, D = unknown>(url: string | WebURL, config?: ResponseTypedConfig<T, D> & TOpts): Promise<FaxiosResponse<T, D>>;
  };
  /**
   * Build the URL for `config` without sending a request. Fills `{key}` placeholders from
   * `pathParams` and applies `baseURL`, `allowAbsoluteUrls`, `params` and `paramsSerializer`
   * like a request does. Schemas are not run, so `pathParams` is used as given. Throws a
   * `FaxiosError` with `ERR_INVALID_URL` when there is neither `url` nor `baseURL`.
   */
  getUri: (config?: FaxiosRequestConfig & TOpts) => string;
  head: {
    <O, D = unknown>(url: string | WebURL, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, D = unknown>(url: string | WebURL, config?: ResponseTypedConfig<T, D> & TOpts): Promise<FaxiosResponse<T, D>>;
  };
  options: {
    <O, D = unknown>(url: string | WebURL, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, D = unknown>(url: string | WebURL, config?: ResponseTypedConfig<T, D> & TOpts): Promise<FaxiosResponse<T, D>>;
  };
  patch: {
    <O, D = unknown>(url: string | WebURL, data: D | undefined, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, D = unknown>(url: string | WebURL, data?: D, config?: ResponseTypedConfig<T, D> & TOpts): Promise<FaxiosResponse<T, D>>;
  };
  patchForm: {
    <O, D = unknown>(url: string | WebURL, data: D | undefined, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, D = unknown>(url: string | WebURL, data?: D, config?: ResponseTypedConfig<T, D> & TOpts): Promise<FaxiosResponse<T, D>>;
  };
  post: {
    <O, D = unknown>(url: string | WebURL, data: D | undefined, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, D = unknown>(url: string | WebURL, data?: D, config?: ResponseTypedConfig<T, D> & TOpts): Promise<FaxiosResponse<T, D>>;
  };
  postForm: {
    <O, D = unknown>(url: string | WebURL, data: D | undefined, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, D = unknown>(url: string | WebURL, data?: D, config?: ResponseTypedConfig<T, D> & TOpts): Promise<FaxiosResponse<T, D>>;
  };
  put: {
    <O, D = unknown>(url: string | WebURL, data: D | undefined, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, D = unknown>(url: string | WebURL, data?: D, config?: ResponseTypedConfig<T, D> & TOpts): Promise<FaxiosResponse<T, D>>;
  };
  putForm: {
    <O, D = unknown>(url: string | WebURL, data: D | undefined, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, D = unknown>(url: string | WebURL, data?: D, config?: ResponseTypedConfig<T, D> & TOpts): Promise<FaxiosResponse<T, D>>;
  };
  query: {
    <O, D = unknown>(url: string | WebURL, data: D | undefined, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, D = unknown>(url: string | WebURL, data?: D, config?: ResponseTypedConfig<T, D> & TOpts): Promise<FaxiosResponse<T, D>>;
  };
  request: {
    <O, D = unknown>(config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, D = unknown>(config: ResponseTypedConfig<T, D> & TOpts): Promise<FaxiosResponse<T, D>>;
  };
};

/** The default export: an instance plus the static helpers only it carries. */
export type FaxiosStatic = FaxiosInstance & {
  all: typeof all;
  CanceledError: typeof CanceledError;
  default: FaxiosStatic;
  Faxios: typeof Faxios;
  FaxiosError: typeof FaxiosError;
  FaxiosHeaders: typeof FaxiosHeaders;
  formToJSON: typeof formToJSON;
  HttpStatusCode: typeof HttpStatusCode;
  isCancel: typeof isCancel;
  isFaxiosError: typeof isFaxiosError;
  mergeConfig: typeof mergeConfig;
  /** Wraps `fn` so it takes its arguments as one array, for `all(...).then(spread(...))`. */
  spread: <TArgs extends Array<unknown>, TResult>(fn: (...args: TArgs) => TResult) => (arr: TArgs) => TResult;
  toFormData: typeof toFormData;
  VERSION: typeof VERSION;
};

// Create the default instance to be exported; the statics are attached below. It dispatches
// through defaultContext, so the named `create` export inherits from it as `faxios.create` does.
const faxios = createInstance(defaults, defaultContext) as FaxiosStatic;
faxios.create = create;

// Expose Faxios class to allow class inheritance
faxios.Faxios = Faxios;

faxios.CanceledError = CanceledError;
faxios.isCancel = isCancel;
faxios.VERSION = VERSION;
faxios.toFormData = toFormData;

// Expose FaxiosError class
faxios.FaxiosError = FaxiosError;

// Expose all/spread
faxios.all = all;

faxios.spread = fn => arr => fn(...arr);

// Expose isFaxiosError
faxios.isFaxiosError = isFaxiosError;

// Expose mergeConfig
faxios.mergeConfig = mergeConfig;

faxios.FaxiosHeaders = FaxiosHeaders;

faxios.formToJSON = formToJSON;

faxios.HttpStatusCode = HttpStatusCode;

faxios.default = faxios;

// this module should only have a default export
export default faxios;
