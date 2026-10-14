"use strict";

import type FaxiosHeaders from "../core/FaxiosHeaders.js";
import formDataToJSON from "../helpers/formDataToJSON.js";
import toFormData from "../helpers/toFormData.js";
import toURLEncodedForm from "../helpers/toURLEncodedForm.js";
import platform from "../platform.js";
import type {
  FaxiosDefaults,
  GenericFormData,
  InternalFaxiosRequestConfig
} from "../types.js";
import { hasOwnProp, isArrayBuffer, isArrayBufferView, isBlob, isBuffer, isFile, isFileList, isFormData, isHTMLForm, isObject, isReadableStream, isResponse, isStream, isString, isURLSearchParams } from "../utils.js";
import transitionalDefaults from "./transitional.js";

function serializeObjectPayload(
  data: unknown,
  contentType: string,
  formSerializer: Record<string, unknown> | undefined,
  FormDataCtor: (new () => object) | null | undefined
): unknown {
  if (contentType.indexOf("application/x-www-form-urlencoded") > -1) {
    return toURLEncodedForm(data, formSerializer).toString();
  }
  const isFileListPayload = isFileList(data);
  if (isFileListPayload || contentType.indexOf("multipart/form-data") > -1) {
    const _FormData = FormDataCtor;
    return toFormData(
      isFileListPayload ? { "files[]": data } : data,
      (_FormData && new _FormData()) as GenericFormData | null | undefined,
      formSerializer
    );
  }
  return undefined;
}

const defaults: FaxiosDefaults = {
  transitional: transitionalDefaults,

  transformRequest: [
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

      if (isFormData(data)) {
        return hasJSONContentType ? JSON.stringify(formDataToJSON(data)) : data;
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
        return (data as { toString: () => string; }).toString();
      }

      if (isObjectPayload) {
        const formSerializer = this.formSerializer as Record<string, unknown> | undefined;
        const serialized = serializeObjectPayload(data, contentType, formSerializer, this.env?.FormData);
        if (serialized !== undefined) return serialized;
      }

      if (isObjectPayload || hasJSONContentType) {
        headers.setContentType("application/json", false);
        // A string is the JSON text the caller wrote; it isn't parsed to check it, which would
        // cost a full parse of the body.
        return isString(data) ? (data as string).trim() : JSON.stringify(data);
      }

      return data;
    },
  ],

  transformResponse: [
    function transformResponse(
      this: InternalFaxiosRequestConfig,
      data: unknown
    ) {
      const transitional = this.transitional || defaults.transitional;
      const forcedJSONParsing = transitional && transitional.forcedJSONParsing;
      // Own only: a polluted Object.prototype.responseType must not make every body strict JSON.
      // Matched case-insensitively, as validation and the fetch adapter read it.
      const responseType = hasOwnProp(this, "responseType") ? this.responseType : undefined;
      const JSONRequested = typeof responseType === "string" && responseType.toLowerCase() === "json";
      const shouldParseJSON = (forcedJSONParsing && !responseType) || JSONRequested;

      if (isResponse(data) || isReadableStream(data)) {
        return data;
      }

      if (data && isString(data) && shouldParseJSON) {
        try {
          return JSON.parse(data as string, hasOwnProp(this, "parseReviver") ? this.parseReviver : undefined);
        }
        catch (e) {
          // An explicit `responseType: "json"` asks for JSON, so a body that isn't JSON rejects.
          // dispatchRequest turns the SyntaxError into ERR_BAD_RESPONSE with the response.
          if (JSONRequested) throw e;
        }
      }

      return data;
    },
  ],

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

  validateStatus: function validateStatus(status: number) {
    return status >= 200 && status < 300;
  },

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

export default defaults;
