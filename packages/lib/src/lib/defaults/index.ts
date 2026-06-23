"use strict";

import AxiosError from "../core/AxiosError.js";
import formDataToJSON from "../helpers/formDataToJSON.js";
import toFormData from "../helpers/toFormData.js";
import toURLEncodedForm from "../helpers/toURLEncodedForm.js";
import platform from "../platform/index.js";
import type {
  AxiosAdapterName,
  AxiosDefaults,
  AxiosRequestHeaders,
  AxiosResponse,
  GenericFormData,
  InternalAxiosRequestConfig
} from "../types.js";
import utils from "../utils.js";
import transitionalDefaults from "./transitional.js";

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
function serializeObjectPayload(
  data: unknown,
  contentType: string,
  formSerializer: Record<string, unknown> | undefined,
  FormDataCtor: (new (...args: Array<unknown>) => object) | undefined
): unknown {
  if (contentType.indexOf("application/x-www-form-urlencoded") > -1) {
    return toURLEncodedForm(data, formSerializer).toString();
  }
  const isFileList = utils.isFileList(data);
  if (isFileList || contentType.indexOf("multipart/form-data") > -1) {
    const _FormData = FormDataCtor;
    return toFormData(
      isFileList ? { "files[]": data } : data,
      (_FormData && new _FormData()) as GenericFormData | null | undefined,
      formSerializer
    );
  }
  return undefined;
}

function throwOnStrictJSONError(
  e: unknown,
  strictJSONParsing: boolean,
  config: InternalAxiosRequestConfig
): void {
  if (!strictJSONParsing) return;
  if ((e as { name?: string }).name === "SyntaxError") {
    throw AxiosError.from(
      e as Error,
      AxiosError.ERR_BAD_RESPONSE,
      config,
      null,
      (config as unknown as Record<string, unknown>)["response"] as
        | AxiosResponse
        | undefined
    );
  }
  throw e;
}

function stringifySafely(
  rawValue: unknown,
  parser?: ((s: string) => unknown) | null,
  encoder?: ((v: unknown) => string) | null
): unknown {
  if (utils.isString(rawValue)) {
    try {
      (parser || JSON.parse)(rawValue as string);
      return utils.trim(rawValue as string);
    }
    catch (e) {
      if ((e as { name?: string; }).name !== "SyntaxError") {
        throw e;
      }
    }
  }

  return (encoder || JSON.stringify)(rawValue);
}

const defaults: AxiosDefaults = {
  transitional: transitionalDefaults,

  adapter: [ "xhr", "http", "fetch" ] as Array<AxiosAdapterName>,

  transformRequest: [
    function transformRequest(
      this: InternalAxiosRequestConfig,
      data: unknown,
      headers: AxiosRequestHeaders
    ) {
      const contentType =
        (headers.getContentType() as string | null | undefined) || "";
      const hasJSONContentType = contentType.indexOf("application/json") > -1;
      const isObjectPayload = utils.isObject(data);

      if (isObjectPayload && utils.isHTMLForm(data)) {
        const GlobalFormData = (globalThis as Record<string, unknown>)[
          "FormData"
        ] as (new (el?: unknown) => unknown) | undefined;
        if (GlobalFormData) {
          data = new GlobalFormData(data);
        }
      }

      const isFormData = utils.isFormData(data);

      if (isFormData) {
        return hasJSONContentType ? JSON.stringify(formDataToJSON(data)) : data;
      }

      if (
        utils.isArrayBuffer(data) ||
        utils.isBuffer(data) ||
        utils.isStream(data) ||
        utils.isFile(data) ||
        utils.isBlob(data) ||
        utils.isReadableStream?.(data)
      ) {
        return data;
      }
      if (utils.isArrayBufferView(data)) {
        return (data as ArrayBufferView).buffer;
      }
      if (utils.isURLSearchParams(data)) {
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
        return stringifySafely(data);
      }

      return data;
    },
  ],

  transformResponse: [
    function transformResponse(
      this: InternalAxiosRequestConfig,
      data: unknown
    ) {
      const transitional = this.transitional || defaults.transitional;
      const forcedJSONParsing = transitional && transitional.forcedJSONParsing;
      const responseType = this.responseType;
      const JSONRequested = responseType === "json";
      const shouldParseJSON = (forcedJSONParsing && !responseType) || JSONRequested;

      if (utils.isResponse?.(data) || utils.isReadableStream?.(data)) {
        return data;
      }

      if (data && utils.isString(data) && shouldParseJSON) {
        const silentJSONParsing =
          transitional && transitional.silentJSONParsing;
        const strictJSONParsing = !silentJSONParsing && JSONRequested;

        try {
          return JSON.parse(data as string, utils.hasOwnProp(this, "parseReviver") ? this.parseReviver : undefined);
        }
        catch (e) {
          throwOnStrictJSONError(e, strictJSONParsing, this);
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
    FormData: platform.classes.FormData as unknown as
      | (new (...args: Array<unknown>) => object)
      | undefined,
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
