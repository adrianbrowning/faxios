// @ts-self-types="./core.d.ts"
/* eslint-disable no-barrel-files/no-barrel-files */
// `@gcmdev/faxios/core`: create() and the instance API, without the axios-compat statics, schema
// validation or form serialization. Importing it builds no instance. Install the features with
// use(schema()) from `@gcmdev/faxios/schema` and use(form()) from `@gcmdev/faxios/form`.
import mergeConfig from "./lib/core/mergeConfig.ts";
import { createInstance } from "./lib/createInstance.ts";
import type { FaxiosCoreInstance } from "./lib/createInstance.ts";
import createDefaults from "./lib/defaults/index.ts";
import type { FaxiosCoreRequestConfig } from "./lib/types.ts";

export { default as FaxiosError } from "./lib/core/FaxiosError.ts";
export { default as CanceledError } from "./lib/cancel/CanceledError.ts";
export { default as isCancel } from "./lib/cancel/isCancel.ts";
export { default as isFaxiosError } from "./lib/helpers/isFaxiosError.ts";
export { default as FaxiosHeaders } from "./lib/core/FaxiosHeaders.ts";

export type { FaxiosCoreInstance, FaxiosInstance } from "./lib/createInstance.ts";
export type { BasePerCallConfig, DefinedEndpoint, PerCallConfig } from "./lib/core/define.ts";
export type { CoreRouteBuilder } from "./lib/core/route.ts";

export type {
  FaxiosConfigHeaders,
  FaxiosContext,
  FaxiosCoreRequestConfig,
  FaxiosFeature,
  FaxiosFeaturePlugin,
  FaxiosHeaderValue,
  FaxiosMiddleware,
  FaxiosNext,
  FaxiosPlugin,
  FaxiosPluginOptionNames,
  FaxiosPromise,
  FaxiosRequestConfig,
  FaxiosResponse,
  HeadersDefaults,
  InternalFaxiosRequestConfig,
  Method,
  RawFaxiosRequestHeaders,
  ResponseType
} from "./lib/types.ts";

/** A new instance with the faxios defaults merged with `instanceConfig`, and no features. */
export function create(instanceConfig?: FaxiosCoreRequestConfig): FaxiosCoreInstance {
  return createInstance(mergeConfig(createDefaults(), instanceConfig), []);
}
