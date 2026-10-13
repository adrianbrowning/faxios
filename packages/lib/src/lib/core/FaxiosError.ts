// @ts-self-types="./FaxiosError.d.ts" — required for Deno: index.d.ts re-exports SchemaValidationError from here
"use strict";

import stripUserInfo from "../helpers/stripUserInfo.js";
import type { FaxiosResponse, InternalFaxiosRequestConfig } from "../types.js";
import type { StandardSchemaV1 } from "../types/standard-schema.js";
import { getSafeProp, hasOwnProp, isArray, isBuffer, isObject, isPlainObject, isUndefined } from "../utils.js";
import FaxiosHeaders from "./FaxiosHeaders.js";

const REDACTED = "[REDACTED ****]";

// Masked in every toJSON() snapshot; `config.redact` adds keys. Matched lower-cased.
const DEFAULT_REDACT_KEYS: ReadonlyArray<string> = [ "authorization", "proxy-authorization", "cookie", "auth" ];

function hasOwnOrPrototypeToJSON(source: unknown): boolean {
  if (hasOwnProp(source, "toJSON")) {
    return true;
  }

  let prototype = Object.getPrototypeOf(source);

  while (prototype && prototype !== Object.prototype) {
    if (hasOwnProp(prototype, "toJSON")) {
      return true;
    }

    prototype = Object.getPrototypeOf(prototype);
  }

  return false;
}

// Build a plain-object snapshot of `config`, replace the value of any key (case-insensitive)
// listed in `redactKeys` with REDACTED, and strip user info from `url` and `baseURL`. Walks
// through arrays and FaxiosHeaders, and short-circuits on circular references.
function redactConfig(config: unknown, redactKeys: ReadonlyArray<string>): unknown {
  const lowerKeys = new Set(redactKeys.map(k => String(k).toLowerCase()));
  const seen: Array<object> = [];

  const visitObject = (source: object): Record<string, unknown> => {
    const result: Record<string, unknown> = Object.create(null);
    for (const [ key, value ] of Object.entries(source)) {
      const lowerKey = key.toLowerCase();
      let reducedValue: unknown;
      if (lowerKeys.has(lowerKey)) reducedValue = REDACTED;
      else if ((lowerKey === "url" || lowerKey === "baseurl") && typeof value === "string") reducedValue = stripUserInfo(value);
      else reducedValue = visit(value);
      if (!isUndefined(reducedValue)) {
        result[key] = reducedValue;
      }
    }
    return result;
  };

  const visit = (source: unknown): unknown => {
    if (source === null || typeof source !== "object") return source;
    if (isBuffer(source)) return source;
    if (seen.indexOf(source) !== -1) return undefined;

    if (source instanceof FaxiosHeaders) {
      source = source.toJSON();
    }

    seen.push(source as object);

    let result: unknown;
    if (isArray(source)) {
      result = [];
      (source as Array<unknown>).forEach((v, i) => {
        const reducedValue = visit(v);
        if (!isUndefined(reducedValue)) {
          (result as Array<unknown>)[i] = reducedValue;
        }
      });
    }
    else {
      if (!isPlainObject(source) && hasOwnOrPrototypeToJSON(source)) {
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

// `user:pass@` after a `scheme://` anywhere in free text, such as an error message.
const USER_INFO_IN_TEXT = /\b([a-z][a-z\d+\-.]*:[/\\]{2})[^/\\?#\s@]*@/gi;

function stripUserInfoInText(text: string): string {
  return text.replace(USER_INFO_IN_TEXT, "$1");
}

type SerializedCause = { cause?: SerializedCause; code?: string; message: string; name: string; };

// A JSON-safe view of an error's cause chain: each error's name, string `code` and message,
// without config, request or response (so a wrapped FaxiosError leaks none of its config), and
// without URL user info. Non-errors and causes already seen (a cycle) end the chain.
function serializeCause(cause: unknown, seen: Set<unknown>): SerializedCause | undefined {
  if (!(cause instanceof Error) || seen.has(cause)) return undefined;
  seen.add(cause);
  const code = getSafeProp(cause, "code");
  const next = serializeCause(cause.cause, seen);
  return {
    name: cause.name,
    message: stripUserInfoInText(cause.message),
    ...(typeof code === "string" ? { code } : {}),
    ...(next ? { cause: next } : {}),
  };
}

class FaxiosError<T = unknown, D = unknown> extends Error {
  isFaxiosError: boolean;
  code?: string;
  config?: InternalFaxiosRequestConfig<D>;
  request?: unknown;
  response?: FaxiosResponse<T, D>;
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
  static readonly ERR_BAD_RESPONSE = "ERR_BAD_RESPONSE";
  static readonly ERR_BAD_REQUEST = "ERR_BAD_REQUEST";
  static readonly ERR_CANCELED = "ERR_CANCELED";
  static readonly ERR_NOT_SUPPORT = "ERR_NOT_SUPPORT";
  static readonly ERR_INVALID_URL = "ERR_INVALID_URL";
  static readonly ERR_FORM_DATA_DEPTH_EXCEEDED = "ERR_FORM_DATA_DEPTH_EXCEEDED";
  static readonly ERR_BAD_RESPONSE_SCHEMA = "ERR_BAD_RESPONSE_SCHEMA";
  static readonly ERR_BAD_REQUEST_SCHEMA = "ERR_BAD_REQUEST_SCHEMA";
  static readonly ERR_BAD_PARAMS_SCHEMA = "ERR_BAD_PARAMS_SCHEMA";
  static readonly ERR_BAD_PATH_PARAMS_SCHEMA = "ERR_BAD_PATH_PARAMS_SCHEMA";

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
    // The wrapped error keeps its own name (`TypeError`, `SyntaxError`) on `cause`.
    faxiosError.cause = error;

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
    config?: InternalFaxiosRequestConfig<D>,
    request?: unknown,
    response?: FaxiosResponse<T, D>
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
    // The value of any credential key, and of any key listed in the config's own `redact`
    // array (case-insensitive, at any depth), is replaced with REDACTED in the snapshot.
    const config = this.config;
    const extraKeys = config && hasOwnProp(config, "redact") ? config.redact : undefined;
    const redactKeys = isArray(extraKeys)
      ? [ ...DEFAULT_REDACT_KEYS, ...extraKeys.filter(key => typeof key === "string") ]
      : DEFAULT_REDACT_KEYS;
    const serializedConfig = redactConfig(config, redactKeys);

    return {
      // Standard
      message: stripUserInfoInText(this.message),
      name: this.name,
      // Microsoft
      description: this.description,
      number: this.number,
      // Mozilla
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      stack: this.stack === undefined ? undefined : stripUserInfoInText(this.stack),
      // Faxios
      config: serializedConfig,
      code: this.code,
      status: this.status,
      issues: this.issues,
      cause: serializeCause(this.cause, new Set()),
    };
  }
}

const SCHEMA_ERROR_CODES: ReadonlySet<string> = new Set([
  FaxiosError.ERR_BAD_RESPONSE_SCHEMA,
  FaxiosError.ERR_BAD_REQUEST_SCHEMA,
  FaxiosError.ERR_BAD_PARAMS_SCHEMA,
  FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA,
]);

type SchemaIssues = ReadonlyArray<StandardSchemaV1.Issue>;

/**
 * Error thrown when a schema rejects a value. Narrow on `code` to tell them apart.
 * For `ERR_BAD_RESPONSE_SCHEMA`, `response` is always present and `response.data`
 * holds the body as it was before validation (after `transformResponse`).
 */
export type SchemaValidationError =
  | FaxiosError & {
    code: typeof FaxiosError.ERR_BAD_RESPONSE_SCHEMA;
    issues: SchemaIssues;
    response: FaxiosResponse;
  }
  | FaxiosError & {
    code:
      | typeof FaxiosError.ERR_BAD_PARAMS_SCHEMA
      | typeof FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA
      | typeof FaxiosError.ERR_BAD_REQUEST_SCHEMA;
    issues: SchemaIssues;
  };

function isFaxiosResponse(value: unknown): value is FaxiosResponse {
  if (!isObject(value)) return false;
  const r = value as Record<string, unknown>;
  return (
    hasOwnProp(r, "data") &&
    typeof r.status === "number" &&
    typeof r.statusText === "string" &&
    isObject(r.headers) &&
    isObject(r.config) &&
    // headers is the only required field of InternalFaxiosRequestConfig.
    hasOwnProp(r.config, "headers") &&
    isObject((r.config as Record<string, unknown>).headers)
  );
}

export function isSchemaValidationError(err: unknown): err is SchemaValidationError {
  const e = err as Record<string, unknown>;
  return (
    isObject(err) &&
    e.isFaxiosError === true &&
    typeof e.code === "string" &&
    SCHEMA_ERROR_CODES.has(e.code) &&
    Array.isArray(e.issues) &&
    (e.code !== FaxiosError.ERR_BAD_RESPONSE_SCHEMA || isFaxiosResponse(e.response))
  );
}

export default FaxiosError;
