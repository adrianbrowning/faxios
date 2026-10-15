// @ts-self-types="./index.d.ts"
/* eslint-disable no-barrel-files/no-barrel-files */
import faxios from "./lib/faxios.ts";

// Static re-exports so the emitted .d.ts references source modules.
// zshy rewrites .ts -> .js for static import/export, but NOT for inline
// import() type expressions (ImportTypeNode). Destructuring these off the
// runtime instance forced TS to emit the broken inline `import("./x.ts")` form.
export { default as Faxios } from "./lib/core/Faxios.ts";
export { default as FaxiosError, isSchemaValidationError } from "./lib/core/FaxiosError.ts";
export type { FaxiosErrorCode, SchemaValidationError } from "./lib/core/FaxiosError.ts";
export { default as CanceledError } from "./lib/cancel/CanceledError.ts";
export { default as isCancel } from "./lib/cancel/isCancel.ts";
export { default as isFaxiosError } from "./lib/helpers/isFaxiosError.ts";
export { default as toFormData } from "./lib/helpers/toFormData.ts";
export { default as FaxiosHeaders } from "./lib/core/FaxiosHeaders.ts";
export { default as HttpStatusCode } from "./lib/helpers/HttpStatusCode.ts";
export { default as mergeConfig } from "./lib/core/mergeConfig.ts";
export { default as resolveRequestURL } from "./lib/core/resolveRequestURL.ts";
// The core rules built-in and third-party plugins reuse rather than copy.
export { default as canceledFromSignal } from "./lib/cancel/canceledFromSignal.ts";
export { default as assertSignal } from "./lib/core/assertSignal.ts";
export { onAbort, default as raceAbort } from "./lib/helpers/raceAbort.ts";
export type { AbortableSignal } from "./lib/helpers/raceAbort.ts";
export { hasOwnInPrototypeChain } from "./lib/utils.ts";
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
  FaxiosFetchOptions,
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
  FormDataVisitorHelpers,
  FormSerializerOptions,
  GenericAbortSignal,
  GenericFormData,
  GenericHTMLFormElement,
  HeadersDefaults,
  InternalFaxiosRequestConfig,
  Method,
  ParamsSerializerOptions,
  RawFaxiosRequestHeaders,
  ResponseType,
  SerializerVisitor,
  TransitionalOptions
} from "./lib/types.ts";

export { faxios as default };
