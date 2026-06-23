"use strict";

import adapters from "./adapters/adapters.js";
import CanceledError from "./cancel/CanceledError.js";
import CancelToken from "./cancel/CancelToken.js";
import isCancel from "./cancel/isCancel.js";
import Axios from "./core/Axios.js";
import AxiosError from "./core/AxiosError.js";
import AxiosHeaders from "./core/AxiosHeaders.js";
import mergeConfig from "./core/mergeConfig.js";
import defaults from "./defaults/index.js";
import { VERSION } from "./env/data.js";
import bind from "./helpers/bind.js";
import formDataToJSON from "./helpers/formDataToJSON.js";
import HttpStatusCode from "./helpers/HttpStatusCode.js";
import isAxiosError from "./helpers/isAxiosError.js";
import spread from "./helpers/spread.js";
import toFormData from "./helpers/toFormData.js";
import type { AxiosRequestConfig } from "./types.js";
import utils from "./utils.js";

/**
 * Create an instance of Axios
 *
 * @param {Object} defaultConfig The default config for the instance
 *
 * @returns {Axios} A new instance of Axios
 */
function createInstance(defaultConfig: AxiosRequestConfig): AxiosInstance {
  const context = new Axios(defaultConfig);
  const instance = bind(Axios.prototype.request as (...args: Array<unknown>) => unknown, context) as unknown as AxiosInstance;

  // Copy axios.prototype to instance
  utils.extend(instance, Axios.prototype, context, { allOwnKeys: true });

  // Copy context to instance
  utils.extend(instance, context, null, { allOwnKeys: true });

  // Factory for creating new instances
  instance.create = function create(instanceConfig?: AxiosRequestConfig): AxiosInstance {
    return createInstance(mergeConfig(defaultConfig, instanceConfig));
  };

  return instance;
}

export type AxiosInstance = {
  (config: AxiosRequestConfig): Promise<unknown>;
  request(config: AxiosRequestConfig): Promise<unknown>;
  get(url: string, config?: AxiosRequestConfig): Promise<unknown>;
  delete(url: string, config?: AxiosRequestConfig): Promise<unknown>;
  head(url: string, config?: AxiosRequestConfig): Promise<unknown>;
  options(url: string, config?: AxiosRequestConfig): Promise<unknown>;
  post(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<unknown>;
  put(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<unknown>;
  patch(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<unknown>;
  query(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<unknown>;
  defaults: { headers: Record<string, unknown> } & Record<string, unknown>;
  interceptors: { request: object; response: object };
  getUri(config?: AxiosRequestConfig): string;
  create: (instanceConfig?: AxiosRequestConfig) => AxiosInstance;
  Axios: typeof Axios;
  CanceledError: typeof CanceledError;
  CancelToken: typeof CancelToken;
  isCancel: typeof isCancel;
  VERSION: typeof VERSION;
  toFormData: typeof toFormData;
  AxiosError: typeof AxiosError;
  Cancel: typeof CanceledError;
  all: (promises: Array<Promise<unknown>>) => Promise<Array<unknown>>;
  spread: typeof spread;
  isAxiosError: typeof isAxiosError;
  mergeConfig: typeof mergeConfig;
  AxiosHeaders: typeof AxiosHeaders;
  formToJSON: (thing: unknown) => unknown;
  getAdapter: typeof adapters.getAdapter;
  HttpStatusCode: typeof HttpStatusCode;
  default: AxiosInstance;
  [key: string]: unknown;
};

// Create the default instance to be exported
const axios = createInstance(defaults as unknown as AxiosRequestConfig);

// Expose Axios class to allow class inheritance
axios.Axios = Axios;

// Expose Cancel & CancelToken
axios.CanceledError = CanceledError;
axios.CancelToken = CancelToken;
axios.isCancel = isCancel;
axios.VERSION = VERSION;
axios.toFormData = toFormData;

// Expose AxiosError class
axios.AxiosError = AxiosError;

// alias for CanceledError for backward compatibility
axios.Cancel = axios.CanceledError;

// Expose all/spread
axios.all = async function all(promises: Array<Promise<unknown>>): Promise<Array<unknown>> {
  return Promise.all(promises);
};

axios.spread = spread;

// Expose isAxiosError
axios.isAxiosError = isAxiosError;

// Expose mergeConfig
axios.mergeConfig = mergeConfig;

axios.AxiosHeaders = AxiosHeaders;

axios.formToJSON = (thing: unknown): unknown => formDataToJSON(utils.isHTMLForm(thing) ? ((): unknown => {
  const GlobalFormData = (globalThis as Record<string, unknown>)["FormData"] as (new (el?: unknown) => unknown) | undefined;
  return GlobalFormData ? new GlobalFormData(thing) : thing;
})() : thing);

axios.getAdapter = adapters.getAdapter;

axios.HttpStatusCode = HttpStatusCode;

axios.default = axios;

// this module should only have a default export
export default axios;
