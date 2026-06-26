import faxios from "./lib/faxios.ts";

// This module is intended to unwrap Faxios default export as named.
// Keep top-level export same with static properties
// so that it can keep same with es module or cjs
const {
  Faxios,
  FaxiosError,
  CanceledError,
  isCancel,
  CancelToken,
  VERSION,
  all,
  Cancel,
  isFaxiosError,
  spread,
  toFormData,
  FaxiosHeaders,
  HttpStatusCode,
  formToJSON,
  getAdapter,
  mergeConfig,
  create,
} = faxios;

// eslint-disable-next-line no-barrel-files/no-barrel-files
export type {
  InternalFaxiosRequestConfig,
  GenericHTMLFormElement,
  RawFaxiosRequestConfig,
  FaxiosPromise,
  CreateFaxiosDefaults,
  CancelTokenStatic,
} from "./lib/types.ts";

export {
  // eslint-disable-next-line no-barrel-files/no-barrel-files
  faxios as default,
  create,
  Faxios,
  FaxiosError,
  CanceledError,
  isCancel,
  CancelToken,
  VERSION,
  all,
  Cancel,
  isFaxiosError,
  spread,
  toFormData,
  FaxiosHeaders,
  HttpStatusCode,
  formToJSON,
  getAdapter,
  mergeConfig,
};
