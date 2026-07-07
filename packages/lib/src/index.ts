// @ts-self-types="./index.d.ts"
/* eslint-disable no-barrel-files/no-barrel-files */
import faxios from "./lib/faxios.ts";
import type { FaxiosInstance } from "./lib/faxios.ts";
import type { FaxiosRequestConfig } from "./lib/types.ts";

// Static re-exports so the emitted .d.ts references source modules.
// zshy rewrites .ts -> .js for static import/export, but NOT for inline
// import() type expressions (ImportTypeNode). Destructuring these off the
// runtime instance forced TS to emit the broken inline `import("./x.ts")` form.
export { default as Faxios } from "./lib/core/Faxios.ts";
export { default as FaxiosError, isSchemaValidationError } from "./lib/core/FaxiosError.ts";
export { default as CanceledError, default as Cancel } from "./lib/cancel/CanceledError.ts";
export { default as isCancel } from "./lib/cancel/isCancel.ts";
export { default as isFaxiosError } from "./lib/helpers/isFaxiosError.ts";
export { default as toFormData } from "./lib/helpers/toFormData.ts";
export { default as FaxiosHeaders } from "./lib/core/FaxiosHeaders.ts";
export { default as HttpStatusCode } from "./lib/helpers/HttpStatusCode.ts";
export { default as mergeConfig } from "./lib/core/mergeConfig.ts";
export { VERSION } from "./lib/env/data.ts";

export type { StandardSchemaV1 } from "./lib/types/standard-schema.ts";
export type { BasePerCallConfig, DefineConfig, DefinedEndpoint, PerCallConfig } from "./lib/core/define.ts";

export type {
  FaxiosRequestConfig,
  InternalFaxiosRequestConfig,
  FaxiosResponse,
  FaxiosRequestHeaders,
  FaxiosResponseHeadersLike,
  FaxiosHeaderValue,
  Method,
  ResponseType,
  GenericHTMLFormElement,
  RawFaxiosRequestConfig,
  FaxiosPromise,
  CreateFaxiosDefaults
} from "./lib/types.ts";

// Instance-synthesized members (no 1:1 source module). Types are self-contained
// (all/formToJSON) or annotated with statically imported types (create), so no
// inline import() is emitted. Runtime values are the same references as on the instance.
export const all: FaxiosInstance["all"] = faxios.all;
export const formToJSON: FaxiosInstance["formToJSON"] = faxios.formToJSON;
export const create: (instanceConfig?: FaxiosRequestConfig) => FaxiosInstance = faxios.create;

export { faxios as default };
