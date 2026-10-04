// @ts-self-types="./faxios.d.ts"
"use strict";

import CanceledError from "./cancel/CanceledError.js";
import isCancel from "./cancel/isCancel.js";
import Faxios from "./core/Faxios.js";
import FaxiosError from "./core/FaxiosError.js";
import FaxiosHeaders from "./core/FaxiosHeaders.js";
import mergeConfig from "./core/mergeConfig.js";
import defaults from "./defaults/index.js";
import { VERSION } from "./env/data.js";
import formDataToJSON from "./helpers/formDataToJSON.js";
import HttpStatusCode from "./helpers/HttpStatusCode.js";
import isFaxiosError from "./helpers/isFaxiosError.js";
import toFormData from "./helpers/toFormData.js";
import type { DefineConfig, DefinedEndpoint } from "./core/define.js";
import type { RouteBuilder, RouteConfig } from "./core/route.js";
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
  // value you can't call. Return the callable instance instead.
  instance.use = function use(middleware: Parameters<Faxios["use"]>[0]) {
    context.use(middleware);
    return instance;
  } as FaxiosInstance["use"];

  // Factory for creating new instances
  instance.create = function create(instanceConfig?: CreateFaxiosDefaults): FaxiosInstance {
    return createInstance(mergeConfig(defaultConfig, instanceConfig));
  };

  return instance;
}

// PROTOTYPE (#87): type-level spike for typed .use(); not for merge.
type RequireCapabilities<THave, TNeed> = THave extends TNeed
  ? unknown
  : { "faxios: install a plugin that provides this capability first": Exclude<keyof TNeed, keyof THave>; };

export type FaxiosInstance<TOpts = unknown, TCaps = unknown> = Pick<Faxios, "eject"> & {
  use: {
    (middleware: FaxiosMiddleware<TOpts, TCaps>): FaxiosInstance<TOpts, TCaps>;
    <TReq = unknown, TProv = unknown, TOpt = unknown>(
      plugin: FaxiosPlugin<TReq, TProv, TOpt> & RequireCapabilities<TCaps, TReq>
    ): FaxiosInstance<TOpts & TOpt, TCaps & TProv>;
  };
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
