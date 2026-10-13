// @ts-self-types="./faxios.d.ts"
"use strict";

import CanceledError from "./cancel/CanceledError.js";
import isCancel from "./cancel/isCancel.js";
import FaxiosError from "./core/FaxiosError.js";
import FaxiosHeaders from "./core/FaxiosHeaders.js";
import mergeConfig from "./core/mergeConfig.js";
import { createInstance } from "./createInstance.js";
import type { FaxiosInstance } from "./createInstance.js";
import createDefaults from "./defaults/index.js";
import { VERSION } from "./env/data.js";
import { form, formToJSON } from "./features/form.js";
import { schema } from "./features/schema.js";
import HttpStatusCode from "./helpers/HttpStatusCode.js";
import isFaxiosError from "./helpers/isFaxiosError.js";
import toFormData from "./helpers/toFormData.js";
import Faxios from "./rootFaxios.js";

/** The default export: an instance plus the static helpers only it carries. */
export type FaxiosStatic = FaxiosInstance & {
  all: (promises: Array<Promise<unknown>>) => Promise<Array<unknown>>;
  Cancel: typeof CanceledError;
  CanceledError: typeof CanceledError;
  default: FaxiosStatic;
  Faxios: typeof Faxios;
  FaxiosError: typeof FaxiosError;
  FaxiosHeaders: typeof FaxiosHeaders;
  formToJSON: (thing: unknown) => unknown;
  HttpStatusCode: typeof HttpStatusCode;
  isCancel: typeof isCancel;
  isFaxiosError: typeof isFaxiosError;
  mergeConfig: typeof mergeConfig;
  spread: (fn: (...args: Array<unknown>) => unknown) => (arr: Array<unknown>) => unknown;
  toFormData: typeof toFormData;
  VERSION: typeof VERSION;
};

// Create the default instance to be exported, with every feature, as every instance it creates
// has; the statics are attached below.
const faxios = createInstance(createDefaults(), [ schema(), form() ]) as FaxiosStatic;

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

faxios.formToJSON = formToJSON;

faxios.HttpStatusCode = HttpStatusCode;

faxios.default = faxios;

// this module should only have a default export
export default faxios;
