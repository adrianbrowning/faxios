// @ts-self-types="./faxios.d.ts"
"use strict";

import CanceledError from "./cancel/CanceledError.js";
import isCancel from "./cancel/isCancel.js";
import type { DefineConfig, DefinedEndpoint } from "./core/define.js";
import Faxios from "./core/Faxios.js";
import FaxiosError from "./core/FaxiosError.js";
import FaxiosHeaders from "./core/FaxiosHeaders.js";
import mergeConfig from "./core/mergeConfig.js";
import type { RouteConfig, RouteBuilder } from "./core/route.js";
import defaults from "./defaults/index.js";
import { VERSION } from "./env/data.js";
import formDataToJSON from "./helpers/formDataToJSON.js";
import HttpStatusCode from "./helpers/HttpStatusCode.js";
import isFaxiosError from "./helpers/isFaxiosError.js";
import toFormData from "./helpers/toFormData.js";
import type { StandardSchemaV1 } from "./types/standard-schema.js";
import type { FaxiosInterceptorOptions, FaxiosInterceptorRejected, FaxiosRequestConfig, InternalFaxiosRequestConfig, FaxiosResponse, Method, SchemaConfig, StringLiteralsOrString } from "./types.js";
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

  // Factory for creating new instances
  instance.create = function create(instanceConfig?: FaxiosRequestConfig): FaxiosInstance {
    return createInstance(mergeConfig(defaultConfig, instanceConfig));
  };

  return instance;
}

export type FaxiosInstance = {
  <O, D = unknown>(config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  <O, D = unknown>(url: string, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  <T = unknown, R = FaxiosResponse<T>, D = unknown>(config: FaxiosRequestConfig<D>): Promise<R>;
  <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: FaxiosRequestConfig<D>): Promise<R>;
  request: {
    <O, D = unknown>(config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(config: FaxiosRequestConfig<D>): Promise<R>;
  };
  get: {
    <O, D = unknown>(url: string, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: FaxiosRequestConfig<D>): Promise<R>;
  };
  delete: {
    <O, D = unknown>(url: string, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: FaxiosRequestConfig<D>): Promise<R>;
  };
  head: {
    <O, D = unknown>(url: string, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: FaxiosRequestConfig<D>): Promise<R>;
  };
  options: {
    <O, D = unknown>(url: string, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: FaxiosRequestConfig<D>): Promise<R>;
  };
  post: {
    <O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<R>;
  };
  put: {
    <O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<R>;
  };
  patch: {
    <O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<R>;
  };
  query: {
    <O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<R>;
  };
  postForm: {
    <O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<R>;
  };
  putForm: {
    <O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<R>;
  };
  patchForm: {
    <O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
    <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<R>;
  };
  defaults: { headers: Record<string, unknown>; } & Record<string, unknown>;
  interceptors: {
    request: {
      use: (
        fulfilled: (config: InternalFaxiosRequestConfig) => InternalFaxiosRequestConfig | Promise<InternalFaxiosRequestConfig>,
        rejected?: FaxiosInterceptorRejected | null,
        options?: FaxiosInterceptorOptions
      ) => number;
      eject: (id: number) => void;
      clear: () => void;
    };
    response: {
      use: (
        fulfilled: (response: FaxiosResponse) => FaxiosResponse | Promise<FaxiosResponse> | unknown,
        rejected?: FaxiosInterceptorRejected | null,
        options?: FaxiosInterceptorOptions
      ) => number;
      eject: (id: number) => void;
      clear: () => void;
    };
  };
  getUri: (config?: FaxiosRequestConfig) => string;
  define: <
    PP extends StandardSchemaV1 | undefined = undefined,
    P extends StandardSchemaV1 | undefined = undefined,
    D extends StandardSchemaV1 | undefined = undefined,
    R extends StandardSchemaV1 | undefined = undefined
  >(
    method: StringLiteralsOrString<Method>,
    url: string,
    config?: DefineConfig<PP, P, D, R>
  ) => DefinedEndpoint<PP, P, D, R>;
  route: <PP extends StandardSchemaV1 | undefined = undefined>(
    url: string,
    config?: RouteConfig<PP>
  ) => RouteBuilder<PP>;
  create: (instanceConfig?: FaxiosRequestConfig) => FaxiosInstance;
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
const faxios = createInstance(defaults as unknown as FaxiosRequestConfig);

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
