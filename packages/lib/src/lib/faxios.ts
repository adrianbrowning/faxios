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
import type { StandardSchemaV1 } from "./types/standard-schema.js";
import type { Method, StringLiteralsOrString, CreateFaxiosDefaults, FaxiosDefaults, FaxiosHeaderValue, FaxiosMiddleware, FaxiosPlugin, FaxiosRequestConfig, HeadersDefaults, FaxiosResponse, SchemaConfig } from "./types.js";
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
  // value you can't call. Return the callable instance instead. Its parameter mirrors
  // FaxiosInstance's `{}` defaults; the class only needs the runtime shape.
  instance.use = function use<TReq = unknown, TProv = unknown, TOpt = unknown>(
    middleware: FaxiosMiddleware<NoPlugins, NoPlugins> | (FaxiosPlugin<TReq, TProv, TOpt> & CheckPlugin<NoPlugins, TReq, TProv>)
  ): FaxiosInstance<NoPlugins & TOpt, NoPlugins & TProv> {
    context.use(middleware as FaxiosMiddleware | FaxiosPlugin<TReq, TProv, TOpt>);
    // Same object either way: use() only refines the compile-time TOpts/TCaps.
    return instance as unknown as FaxiosInstance<NoPlugins & TOpt, NoPlugins & TProv>;
  };

  // Factory for creating new instances
  instance.create = function create(instanceConfig?: CreateFaxiosDefaults): FaxiosInstance {
    return createInstance(mergeConfig(defaultConfig, instanceConfig));
  };

  return instance;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the `{}` default of FaxiosInstance's TOpts/TCaps
type NoPlugins = {};

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

type CheckPlugin<THave, TReq, TProv> = RequireCapabilities<THave, TReq> & RejectDuplicateCapabilities<THave, TProv>;

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
    middleware: FaxiosMiddleware<TOpts, TCaps> | (FaxiosPlugin<TReq, TProv, TOpt> & CheckPlugin<TCaps, TReq, TProv>)
  ) => FaxiosInstance<TOpts & TOpt, TCaps & TProv>;
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
  default: FaxiosInstance;
};

// Create the default instance to be exported
const faxios = createInstance(defaults);

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

faxios.formToJSON = (thing: unknown): unknown => formDataToJSON(utils.isHTMLForm(thing) ? ((): unknown => {
  const GlobalFormData = (globalThis as Record<string, unknown>)["FormData"] as (new (el?: unknown) => unknown) | undefined;
  return GlobalFormData ? new GlobalFormData(thing) : thing;
})() : thing);

faxios.HttpStatusCode = HttpStatusCode;

faxios.default = faxios;

// this module should only have a default export
export default faxios;
