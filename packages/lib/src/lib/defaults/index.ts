"use strict";

import FaxiosError from "../core/FaxiosError.js";
import type FaxiosHeaders from "../core/FaxiosHeaders.js";
import { requireForm } from "../core/features.js";
import platform from "../platform.js";
import type {
  FaxiosDefaults,
  FaxiosResponse,
  GenericFormData,
  InternalFaxiosRequestConfig
} from "../types.js";
import { hasOwnProp, isArrayBuffer, isArrayBufferView, isBlob, isBuffer, isFile, isFileList, isFormData, isHTMLForm, isObject, isReadableStream, isResponse, isStream, isString, isURLSearchParams } from "../utils.js";
import transitionalDefaults from "./transitional.js";

// An object body sent as a form needs the form feature (`@gcmdev/faxios/form`); `undefined` for
// any other body.
function serializeObjectPayload(
  config: InternalFaxiosRequestConfig,
  data: unknown,
  contentType: string
): unknown {
  const formSerializer = config.formSerializer as Record<string, unknown> | undefined;
  if (contentType.indexOf("application/x-www-form-urlencoded") > -1) {
    return requireForm(config, "An application/x-www-form-urlencoded body").toURLEncoded(data, formSerializer);
  }
  const fileList = isFileList(data);
  if (fileList || contentType.indexOf("multipart/form-data") > -1) {
    const form = requireForm(config, fileList ? "A FileList body" : "A multipart/form-data body");
    const FormDataCtor = config.env?.FormData;
    return form.toFormData(
      fileList ? { "files[]": data } : data,
      (FormDataCtor && new FormDataCtor()) as GenericFormData | null | undefined,
      formSerializer
    );
  }
  return undefined;
}

// An explicit `responseType: "json"` asks for JSON, so a body that isn't JSON rejects.
function throwOnStrictJSONError(
  e: unknown,
  JSONRequested: boolean,
  config: InternalFaxiosRequestConfig
): void {
  if (!JSONRequested) return;
  if (e instanceof SyntaxError) {
    throw FaxiosError.from(
      e,
      FaxiosError.ERR_BAD_RESPONSE,
      config,
      null,
      (config as unknown as Record<string, unknown>)["response"] as
        | FaxiosResponse
        | undefined
    );
  }
  throw e;
}

/**
 * It takes a string, tries to parse it, and if it fails, it returns the stringified version
 * of the input
 *
 * @param {any} rawValue - The value to be stringified.
 * @param {Function} parser - A function that parses a string into a JavaScript object.
 * @param {Function} encoder - A function that takes a value and returns a string.
 *
 * @returns {string} A stringified version of the rawValue.
 */
function stringifySafely(
  rawValue: unknown,
  parser?: ((s: string) => unknown) | null,
  encoder?: ((v: unknown) => string) | null
): unknown {
  if (isString(rawValue)) {
    try {
      (parser || JSON.parse)(rawValue as string);
      return (rawValue as string).trim();
    }
    catch (e) {
      if ((e as { name?: string; }).name !== "SyntaxError") {
        throw e;
      }
    }
  }

  return (encoder || JSON.stringify)(rawValue);
}

function transformRequest(
  this: InternalFaxiosRequestConfig,
  data: unknown,
  headers: FaxiosHeaders
) {
  const contentType =
    (headers.getContentType() as null | string | undefined) || "";
  const hasJSONContentType = contentType.indexOf("application/json") > -1;
  const isObjectPayload = isObject(data);

  if (isObjectPayload && isHTMLForm(data)) {
    const GlobalFormData = (globalThis as Record<string, unknown>)[
      "FormData"
    ] as (new (el?: unknown) => unknown) | undefined;
    if (GlobalFormData) {
      data = new GlobalFormData(data);
    }
  }

  const formData = isFormData(data);

  if (formData) {
    return hasJSONContentType ? JSON.stringify(requireForm(this, "A FormData body sent as JSON").formDataToJSON(data)) : data;
  }

  // fetch takes any ArrayBufferView as a body and sends only the view's bytes.
  // Never unwrap it to `.buffer`: a subarray or DataView would send the whole backing buffer.
  if (
    isArrayBuffer(data) ||
    isArrayBufferView(data) ||
    isBuffer(data) ||
    isStream(data) ||
    isFile(data) ||
    isBlob(data) ||
    isReadableStream(data)
  ) {
    return data;
  }
  if (isURLSearchParams(data)) {
    headers.setContentType(
      "application/x-www-form-urlencoded;charset=utf-8",
      false
    );
    return String(data);
  }

  if (isObjectPayload) {
    const serialized = serializeObjectPayload(this, data, contentType);
    if (serialized !== undefined) return serialized;
  }

  if (isObjectPayload || hasJSONContentType) {
    headers.setContentType("application/json", false);
    return stringifySafely(data);
  }

  return data;
}

function transformResponse(
  this: InternalFaxiosRequestConfig,
  data: unknown
) {
  const forcedJSONParsing = (this.transitional || transitionalDefaults).forcedJSONParsing;
  // Own only: a polluted Object.prototype.responseType must not make every body strict JSON.
  const responseType = hasOwnProp(this, "responseType") ? this.responseType : undefined;
  const JSONRequested = responseType === "json";
  const shouldParseJSON = (forcedJSONParsing && !responseType) || JSONRequested;

  if (isResponse(data) || isReadableStream(data)) {
    return data;
  }

  if (data && isString(data) && shouldParseJSON) {
    try {
      return JSON.parse(data as string, hasOwnProp(this, "parseReviver") ? this.parseReviver : undefined);
    }
    catch (e) {
      throwOnStrictJSONError(e, JSONRequested, this);
    }
  }

  return data;
}

function validateStatus(status: number) {
  return status >= 200 && status < 300;
}

/**
 * Fresh defaults for an instance built from scratch. A factory, so the root default instance,
 * whose `defaults` callers mutate, shares no object with instances `./core` creates.
 */
export default function createDefaults(): FaxiosDefaults {
  return {
    transitional: transitionalDefaults,

    transformRequest: [ transformRequest ],

    transformResponse: [ transformResponse ],

    /**
     * A timeout in milliseconds to abort a request. If set to 0 (default) a
     * timeout is not created.
     */
    timeout: 0,

    xsrfCookieName: "XSRF-TOKEN",
    xsrfHeaderName: "X-XSRF-TOKEN",

    maxContentLength: -1,
    maxBodyLength: -1,

    env: {
      FormData: platform.classes.FormData,
    },

    validateStatus,

    headers: {
      common: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": undefined,
      },
      delete: {},
      get: {},
      head: {},
      post: {},
      put: {},
      patch: {},
      query: {},
    },
  };
}
