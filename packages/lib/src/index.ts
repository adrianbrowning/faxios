// @ts-self-types="./index.d.ts"
/* eslint-disable no-barrel-files/no-barrel-files */
import faxios from "./lib/faxios.ts";

// Static re-exports so the emitted .d.ts references source modules.
// zshy rewrites .ts -> .js for static import/export, but NOT for inline
// import() type expressions (ImportTypeNode). Destructuring these off the
// runtime instance forced TS to emit the broken inline `import("./x.ts")` form.
export { default as Faxios } from "./lib/core/Faxios.ts";
export { default as FaxiosError, isSchemaValidationError } from "./lib/core/FaxiosError.ts";
export type { SchemaValidationError } from "./lib/core/FaxiosError.ts";
export { default as Cancel, default as CanceledError } from "./lib/cancel/CanceledError.ts";
export { default as isCancel } from "./lib/cancel/isCancel.ts";
export { default as isFaxiosError } from "./lib/helpers/isFaxiosError.ts";
export { default as toFormData } from "./lib/helpers/toFormData.ts";
export { default as FaxiosHeaders } from "./lib/core/FaxiosHeaders.ts";
export { default as HttpStatusCode } from "./lib/helpers/HttpStatusCode.ts";
export { default as mergeConfig } from "./lib/core/mergeConfig.ts";
export { default as resolveRequestURL } from "./lib/core/resolveRequestURL.ts";
export { VERSION } from "./lib/env/data.ts";
// Standalone modules that faxios.ts also attaches to the default instance. Reading them off the
// instance here would keep the whole library in every bundle that imports any named export.
export { all } from "./lib/helpers/all.ts";
export { formToJSON } from "./lib/helpers/formToJSON.ts";
export { create } from "./lib/create.ts";

export type { FaxiosInstance, FaxiosStatic } from "./lib/faxios.ts";
export type { StandardSchemaV1 } from "./lib/types/standard-schema.ts";
export type { BasePerCallConfig, DefineConfig, DefinedEndpoint, FaxiosLike, PerCallConfig } from "./lib/core/define.ts";
export type { RouteBuilder, RouteConfig, RouteMethodConfig } from "./lib/core/route.ts";

export type {
  CreateFaxiosDefaults,
  CustomParamsSerializer,
  FaxiosBasicCredentials,
  FaxiosConfigHeaders,
  FaxiosContext,
  FaxiosDefaults,
  FaxiosHeaderValue,
  FaxiosMiddleware,
  FaxiosNext,
  FaxiosPlugin,
  FaxiosPluginOptionNames,
  FaxiosPluginSpec,
  FaxiosProgressEvent,
  FaxiosPromise,
  FaxiosRequestConfig,
  FaxiosRequestTransformer,
  FaxiosResponse,
  FaxiosResponseTransformer,
  FormSerializerOptions,
  GenericAbortSignal,
  GenericFormData,
  GenericHTMLFormElement,
  HeadersDefaults,
  InternalFaxiosRequestConfig,
  Method,
  ParamsSerializerOptions,
  RawFaxiosRequestConfig,
  RawFaxiosRequestHeaders,
  ResponseType,
  TransitionalOptions
} from "./lib/types.ts";

export { faxios as default };
