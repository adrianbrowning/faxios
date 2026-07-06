"use strict";

import type { StandardSchemaV1 } from "../types/standard-schema.js";
import type { InternalFaxiosRequestConfig, FaxiosResponse } from "../types.js";
import utils from "../utils.js";
import FaxiosHeaders from "./FaxiosHeaders.js";

const REDACTED = "[REDACTED ****]";

function hasOwnOrPrototypeToJSON(source: unknown): boolean {
  if (utils.hasOwnProp(source, "toJSON")) {
    return true;
  }

  let prototype = Object.getPrototypeOf(source);

  while (prototype && prototype !== Object.prototype) {
    if (utils.hasOwnProp(prototype, "toJSON")) {
      return true;
    }

    prototype = Object.getPrototypeOf(prototype);
  }

  return false;
}

// Build a plain-object snapshot of `config` and replace the value of any key
// (case-insensitive) listed in `redactKeys` with REDACTED. Walks through arrays
// and FaxiosHeaders, and short-circuits on circular references.
function redactConfig(config: unknown, redactKeys: Array<string>): unknown {
  const lowerKeys = new Set(redactKeys.map(k => String(k).toLowerCase()));
  const seen: Array<object> = [];

  const visitObject = (source: object): Record<string, unknown> => {
    const result: Record<string, unknown> = Object.create(null);
    for (const [ key, value ] of Object.entries(source)) {
      const reducedValue = lowerKeys.has(key.toLowerCase())
        ? REDACTED
        : visit(value);
      if (!utils.isUndefined(reducedValue)) {
        result[key] = reducedValue;
      }
    }
    return result;
  };

  const visit = (source: unknown): unknown => {
    if (source === null || typeof source !== "object") return source;
    if (utils.isBuffer(source)) return source;
    if (seen.indexOf(source) !== -1) return undefined;

    if (source instanceof FaxiosHeaders) {
      source = source.toJSON();
    }

    seen.push(source as object);

    let result: unknown;
    if (utils.isArray(source)) {
      result = [];
      (source as Array<unknown>).forEach((v, i) => {
        const reducedValue = visit(v);
        if (!utils.isUndefined(reducedValue)) {
          (result as Array<unknown>)[i] = reducedValue;
        }
      });
    }
    else {
      if (!utils.isPlainObject(source) && hasOwnOrPrototypeToJSON(source)) {
        seen.pop();
        return source;
      }
      result = visitObject(source as object);
    }

    seen.pop();
    return result;
  };

  return visit(config);
}

class FaxiosError extends Error {
  isFaxiosError: boolean;
  code?: string;
  config?: InternalFaxiosRequestConfig;
  request?: unknown;
  response?: FaxiosResponse;
  status?: number;
  override cause?: Error;
  issues?: ReadonlyArray<StandardSchemaV1.Issue>;
  // legacy/cross-browser optional props:
  description?: unknown;
  number?: unknown;
  fileName?: unknown;
  lineNumber?: unknown;
  columnNumber?: unknown;
  event?: unknown;
  override name: string;

  static readonly ERR_BAD_OPTION_VALUE = "ERR_BAD_OPTION_VALUE";
  static readonly ERR_BAD_OPTION = "ERR_BAD_OPTION";
  static readonly ECONNABORTED = "ECONNABORTED";
  static readonly ETIMEDOUT = "ETIMEDOUT";
  static readonly ECONNREFUSED = "ECONNREFUSED";
  static readonly ERR_NETWORK = "ERR_NETWORK";
  static readonly ERR_FR_TOO_MANY_REDIRECTS = "ERR_FR_TOO_MANY_REDIRECTS";
  static readonly ERR_DEPRECATED = "ERR_DEPRECATED";
  static readonly ERR_BAD_RESPONSE = "ERR_BAD_RESPONSE";
  static readonly ERR_BAD_REQUEST = "ERR_BAD_REQUEST";
  static readonly ERR_CANCELED = "ERR_CANCELED";
  static readonly ERR_NOT_SUPPORT = "ERR_NOT_SUPPORT";
  static readonly ERR_INVALID_URL = "ERR_INVALID_URL";
  static readonly ERR_FORM_DATA_DEPTH_EXCEEDED = "ERR_FORM_DATA_DEPTH_EXCEEDED";
  static readonly ERR_BAD_RESPONSE_SCHEMA = "ERR_BAD_RESPONSE_SCHEMA";

  static from(
    error: Error & { code?: string; status?: number; },
    code?: string,
    config?: InternalFaxiosRequestConfig,
    request?: unknown,
    response?: FaxiosResponse,
    customProps?: Record<string, unknown>
  ): FaxiosError {
    const faxiosError = new FaxiosError(
      error.message,
      code || error.code,
      config,
      request,
      response
    );
    faxiosError.cause = error;
    faxiosError.name = error.name;

    // Preserve status from the original error if not already set from response
    if (error.status != null && faxiosError.status == null) {
      faxiosError.status = error.status;
    }

    customProps && Object.assign(faxiosError, customProps);
    return faxiosError;
  }

  /**
   * Create an Error with the specified message, config, error code, request and response.
   *
   * @param {string} message The error message.
   * @param {string} [code] The error code (for example, 'ECONNABORTED').
   * @param {Object} [config] The config.
   * @param {Object} [request] The request.
   * @param {Object} [response] The response.
   *
   * @returns {Error} The created error.
   */
  constructor(
    message: string,
    code?: string,
    config?: InternalFaxiosRequestConfig,
    request?: unknown,
    response?: FaxiosResponse
  ) {
    super(message);

    // Make message enumerable to maintain backward compatibility
    // The native Error constructor sets message as non-enumerable,
    // but faxios < v1.13.3 had it as enumerable
    Object.defineProperty(
      this,
      "message",
      Object.assign(Object.create(null) as PropertyDescriptor, {
        value: message,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    );

    this.name = "FaxiosError";
    this.isFaxiosError = true;
    code && (this.code = code);
    config && (this.config = config);
    request && (this.request = request);
    if (response) {
      this.response = response;
      this.status = response.status;
    }
  }

  toJSON() {
    // Opt-in redaction: when the request config carries a `redact` array, the
    // value of any matching key (case-insensitive, at any depth) is replaced
    // with REDACTED in the serialized snapshot. Undefined or empty leaves the
    // existing serialization behavior unchanged.
    const config = this.config;
    const redactKeys =
      config && utils.hasOwnProp(config, "redact") ? config.redact : undefined;
    const serializedConfig =
      utils.isArray(redactKeys) && redactKeys.length > 0
        ? redactConfig(config, redactKeys)
        : utils.toJSONObject(config);

    return {
      // Standard
      message: this.message,
      name: this.name,
      // Microsoft
      description: this.description,
      number: this.number,
      // Mozilla
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      stack: this.stack,
      // Faxios
      config: serializedConfig,
      code: this.code,
      status: this.status,
      issues: this.issues,
    };
  }
}

export function isSchemaValidationError(
  err: unknown
): err is FaxiosError & { issues: ReadonlyArray<StandardSchemaV1.Issue>; } {
  const e = err as Record<string, unknown>;
  return (
    utils.isObject(err) &&
    e.isFaxiosError === true &&
    e.code === FaxiosError.ERR_BAD_RESPONSE_SCHEMA &&
    Array.isArray(e.issues)
  );
}

export default FaxiosError;
