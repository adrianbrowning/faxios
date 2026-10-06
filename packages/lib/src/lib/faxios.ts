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
import defaults from "./defaults/index.js";
import { VERSION } from "./env/data.js";
import formDataToJSON from "./helpers/formDataToJSON.js";
import HttpStatusCode from "./helpers/HttpStatusCode.js";
import isFaxiosError from "./helpers/isFaxiosError.js";
import toFormData from "./helpers/toFormData.js";
import authBearer from "./plugins/authBearer.js";
import retry from "./plugins/retry.js";
import timing from "./plugins/timing.js";
import type { StandardSchemaV1 } from "./types/standard-schema.js";
import type { Method, StringLiteralsOrString, CreateFaxiosDefaults, FaxiosDefaults, FaxiosHeaderValue, FaxiosMiddleware, FaxiosPluginArgument, FaxiosRequestConfig, HeadersDefaults, FaxiosResponse, SchemaConfig } from "./types.js";
import utils from "./utils.js";

/**
 * Create an instance of Faxios
 *
 * @param {Object} defaultConfig The default config for the instance
 *
 * @returns {Faxios} A new instance of Faxios
 */
function createInstance(defaultConfig: FaxiosRequestConfig): FaxiosInstance {
  const context = new Faxios(defaultConfig);
  const instance = (Faxios.prototype.request as (...args: Array<unknown>) => unknown).bind(context) as unknown as FaxiosInstance;

  // Copy faxios.prototype to instance. The instance is a callable populated
  // dynamically here; extend mutates it via own-key copy.
  const target = instance as unknown as Record<string, unknown>;
  utils.extend(target, Faxios.prototype, context, { allOwnKeys: true });

  // Copy context to instance
  utils.extend(target, context, null, { allOwnKeys: true });

  // extend() bound use() to the inner Faxios object, so its `return this` would hand back a
  // value you can't call. Return the callable instance instead. At runtime this only delegates
  // to context.use(); the plugin rules live in FaxiosInstance["use"], so the cast is the single
  // place the phantom TOpts/TCaps refinement meets the untyped registry.
  const use = (middleware: Parameters<Faxios["use"]>[0]): FaxiosInstance => {
    context.use(middleware);
    return instance;
  };
  instance.use = use as FaxiosInstance["use"];

  // Factory for creating new instances
  instance.create = function create(instanceConfig?: CreateFaxiosDefaults): FaxiosInstance {
    return createInstance(mergeConfig(defaultConfig, instanceConfig));
  };

  return instance;
}

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

// use() copies capabilities with Object.keys() and skips the keys that could pollute a prototype, so
// a symbol or dangerous key would be typed on ctx.capabilities but never set, and nothing could
// ever satisfy a requirement for one.
type UnsupportedCapabilityKeys<TCaps> = Extract<keyof TCaps, symbol | "__proto__" | "constructor" | "prototype">;

type RejectUnsupportedCapabilityKeys<TReq, TProv> = [UnsupportedCapabilityKeys<TReq> | UnsupportedCapabilityKeys<TProv>] extends [never]
  ? unknown
  : { "faxios: capability names must be strings other than __proto__, constructor and prototype": UnsupportedCapabilityKeys<TReq> | UnsupportedCapabilityKeys<TProv>; };

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
export type FaxiosInstance<TOpts = {}, TCaps = {}> = Pick<Faxios, "eject"> & {
  /**
   * Register middleware or a plugin and return this instance, typed with the plugin's request
   * options and capabilities added. A plugin whose required capabilities aren't installed yet, or
   * that provides a capability another installed plugin already provides, is a type error.
   */
  use: <TReq = unknown, TProv = unknown, TOpt = unknown>(
    middleware: FaxiosMiddleware<TOpts, TCaps> | (FaxiosPluginArgument<TReq, TProv, TOpt> & CheckPlugin<TCaps, TReq, TProv, TOpt>)
  ) => FaxiosInstance<TOpts & TOpt, TCaps & ProvidedCapabilities<TProv>>;
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
  route: <PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined = undefined>(
    url: string,
    config?: RouteConfig<PP> & TOpts
  ) => RouteBuilder<PP, TOpts>;
  <O, D = unknown>(config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
  <O, D = unknown>(url: string, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
  <T = unknown, R = FaxiosResponse<T>, D = unknown>(config: FaxiosRequestConfig<D> & TOpts): Promise<R>;
  <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: FaxiosRequestConfig<D> & TOpts): Promise<R>;
  request: {
    <O, D = unknown>(config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(config: FaxiosRequestConfig<D> & TOpts): Promise<R>;
  };
  get: {
    <O, D = unknown>(url: string, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: FaxiosRequestConfig<D> & TOpts): Promise<R>;
  };
  delete: {
    <O, D = unknown>(url: string, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: FaxiosRequestConfig<D> & TOpts): Promise<R>;
  };
  head: {
    <O, D = unknown>(url: string, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: FaxiosRequestConfig<D> & TOpts): Promise<R>;
  };
  options: {
    <O, D = unknown>(url: string, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: FaxiosRequestConfig<D> & TOpts): Promise<R>;
  };
  post: {
    <O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D> & TOpts): Promise<R>;
  };
  put: {
    <O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D> & TOpts): Promise<R>;
  };
  patch: {
    <O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D> & TOpts): Promise<R>;
  };
  query: {
    <O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D> & TOpts): Promise<R>;
  };
  postForm: {
    <O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D> & TOpts): Promise<R>;
  };
  putForm: {
    <O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D> & TOpts): Promise<R>;
  };
  patchForm: {
    <O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D> & TOpts): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D> & TOpts): Promise<R>;
  };
  // `common` plus one header group per method; a key set directly on
  // `headers` applies to every method.
  defaults: Omit<FaxiosDefaults, "headers"> & {
    headers: HeadersDefaults & { [key: string]: FaxiosHeaderValue | undefined; };
  } & Partial<TOpts>;
  getUri: (config?: FaxiosRequestConfig & TOpts) => string;
  create: (instanceConfig?: CreateFaxiosDefaults) => FaxiosInstance;
};

/** The default export: an instance plus the static helpers only it carries. */
export type FaxiosStatic = FaxiosInstance & {
  Faxios: typeof Faxios;
  CanceledError: typeof CanceledError;
  isCancel: typeof isCancel;
  VERSION: typeof VERSION;
  toFormData: typeof toFormData;
  FaxiosError: typeof FaxiosError;
  Cancel: typeof CanceledError;
  all: (promises: Array<Promise<unknown>>) => Promise<Array<unknown>>;
  spread: (fn: (...args: Array<unknown>) => unknown) => (arr: Array<unknown>) => unknown;
  isFaxiosError: typeof isFaxiosError;
  mergeConfig: typeof mergeConfig;
  FaxiosHeaders: typeof FaxiosHeaders;
  formToJSON: (thing: unknown) => unknown;
  HttpStatusCode: typeof HttpStatusCode;
  /** Built-in plugins for `use()`; also available as named exports. */
  plugins: { authBearer: typeof authBearer; retry: typeof retry; timing: typeof timing; };
  default: FaxiosStatic;
};

// Create the default instance to be exported; the statics are attached below.
const faxios = createInstance(defaults) as FaxiosStatic;

// Expose Faxios class to allow class inheritance
faxios.Faxios = Faxios;

faxios.CanceledError = CanceledError;
faxios.isCancel = isCancel;
faxios.VERSION = VERSION;
faxios.toFormData = toFormData;

// Expose FaxiosError class
faxios.FaxiosError = FaxiosError;

// alias for CanceledError for backward compatibility
faxios.Cancel = faxios.CanceledError;

// Expose all/spread
faxios.all = async function all(promises: Array<Promise<unknown>>): Promise<Array<unknown>> {
  return Promise.all(promises);
};

faxios.spread = (fn: (...args: Array<unknown>) => unknown) => (arr: Array<unknown>) => fn(...arr);

// Expose isFaxiosError
faxios.isFaxiosError = isFaxiosError;

// Expose mergeConfig
faxios.mergeConfig = mergeConfig;

faxios.FaxiosHeaders = FaxiosHeaders;

faxios.plugins = { authBearer, retry, timing };

faxios.formToJSON = (thing: unknown): unknown => formDataToJSON(utils.isHTMLForm(thing) ? ((): unknown => {
  const GlobalFormData = (globalThis as Record<string, unknown>)["FormData"] as (new (el?: unknown) => unknown) | undefined;
  return GlobalFormData ? new GlobalFormData(thing) : thing;
})() : thing);

faxios.HttpStatusCode = HttpStatusCode;

faxios.default = faxios;

// this module should only have a default export
export default faxios;
