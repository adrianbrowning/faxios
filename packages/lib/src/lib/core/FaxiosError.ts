// @ts-self-types="./FaxiosError.d.ts" — required for Deno: index.d.ts re-exports SchemaValidationError from here
"use strict";

import stripUserInfo from "../helpers/stripUserInfo.js";
import type { FaxiosResponse, InternalFaxiosRequestConfig } from "../types.js";
import type { StandardSchemaV1 } from "../types/standard-schema.js";
import utils from "../utils.js";
import FaxiosHeaders from "./FaxiosHeaders.js";

const REDACTED = "[REDACTED ****]";

// Masked in every toJSON() snapshot; `config.redact` adds keys. Matched lower-cased.
const DEFAULT_REDACT_KEYS: ReadonlyArray<string> = [ "authorization", "proxy-authorization", "cookie", "auth" ];

// Build a plain-object snapshot of `config`: the value of any key (case-insensitive) listed in
// `redactKeys` becomes REDACTED, and `url` and `baseURL` lose their user info. Walks arrays,
// FaxiosHeaders, and what a value's own or class `toJSON` returns: called once with its key, as
// JSON.stringify calls it, and never one only a polluted Object.prototype supplies. A value that
// refers back to an object being walked (a cycle), and a value whose toJSON throws, are left out.
// A value with a toJSON is kept as it is when its output holds nothing to mask, so it serializes
// its own way; otherwise the masked copy of that output replaces it.
function redactConfig(config: unknown, redactKeys: ReadonlyArray<string>): unknown {
  const lowerKeys = new Set(redactKeys.map(k => String(k).toLowerCase()));
  const seen: Array<object> = [];
  // Every masked, stripped or dropped value, so a toJSON value knows whether its output changed.
  let edits = 0;

  // The snapshot of one object entry: masked, stripped of URL user info, or visited.
  const maskEntry = (key: string, value: unknown): unknown => {
    const lowerKey = key.toLowerCase();
    if (lowerKeys.has(lowerKey)) {
      edits++;
      return REDACTED;
    }
    if ((lowerKey === "url" || lowerKey === "baseurl") && typeof value === "string") {
      const stripped = stripUserInfo(value);
      if (stripped !== value) edits++;
      return stripped;
    }
    return visit(value, key);
  };

  // A copy of `source`'s own entries (array items, or enumerable string keys), each visited.
  const copyEntries = (source: object): unknown => {
    seen.push(source);
    let result: unknown;
    if (utils.isArray(source)) {
      const items: Array<unknown> = [];
      source.forEach((item, index) => {
        const reduced = visit(item, String(index));
        if (!utils.isUndefined(reduced)) items[index] = reduced;
      });
      result = items;
    }
    else {
      const record: Record<string, unknown> = Object.create(null);
      for (const [ key, value ] of Object.entries(source)) {
        // Copied, a serializer would run on the copy and emit what it closes over, unmasked.
        if (key === "toJSON" && typeof value === "function") continue;
        const reduced = maskEntry(key, value);
        if (!utils.isUndefined(reduced)) record[key] = reduced;
      }
      result = record;
    }
    seen.pop();
    return result;
  };

  const visit = (value: unknown, key: string): unknown => {
    if (value === null || typeof value !== "object" || utils.isBuffer(value)) return value;
    if (seen.includes(value)) {
      edits++;
      return undefined;
    }
    if (value instanceof FaxiosHeaders) return copyEntries(value.toJSON());
    // Arrays skip the lookup, so a polluted Array.prototype.toJSON can't stand in for one.
    const serialize = utils.isArray(value) ? undefined : utils.getSafeProp(value, "toJSON");
    if (typeof serialize !== "function") return copyEntries(value);

    const before = edits;
    let output: unknown;
    try {
      output = serialize.call(value, key);
    }
    catch {
      edits++;
      return undefined;
    }
    // JSON.stringify serializes the output without calling a toJSON on the output itself.
    let masked = output;
    if (output !== null && typeof output === "object") {
      seen.push(value);
      if (output !== value && seen.includes(output)) {
        edits++;
        masked = undefined;
      }
      else masked = copyEntries(output);
      seen.pop();
    }
    return edits === before ? value : masked;
  };

  return visit(config, "");
}

// `user:pass@` after a `scheme://` anywhere in free text, such as an error message. A match can
// start only at a scheme character followed by `:` and two slashes, and the user info stops at the
// first `/`, so the scan is linear: matching the whole scheme from a word boundary rescanned the
// text from every letter of a long `a.a.a…` path, which took seconds on a 200 kB message.
const USER_INFO_IN_TEXT = /([a-z\d+\-.]:[/\\]{2})[^/\\?#\s@]*@/gi;

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
  const code = utils.getSafeProp(cause, "code");
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
  override name: string;

  static readonly ERR_BAD_OPTION_VALUE = "ERR_BAD_OPTION_VALUE";
  static readonly ERR_BAD_OPTION = "ERR_BAD_OPTION";
  static readonly ECONNABORTED = "ECONNABORTED";
  static readonly ETIMEDOUT = "ETIMEDOUT";
  static readonly ERR_NETWORK = "ERR_NETWORK";
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
    response?: FaxiosResponse
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
    const extraKeys = config && utils.hasOwnProp(config, "redact") ? config.redact : undefined;
    const redactKeys = utils.isArray(extraKeys)
      ? [ ...DEFAULT_REDACT_KEYS, ...extraKeys.filter(key => typeof key === "string") ]
      : DEFAULT_REDACT_KEYS;
    const serializedConfig = redactConfig(config, redactKeys);

    return {
      // Standard
      message: stripUserInfoInText(this.message),
      name: this.name,
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
  if (!utils.isObject(value)) return false;
  const r = value as Record<string, unknown>;
  return (
    utils.hasOwnProp(r, "data") &&
    typeof r.status === "number" &&
    typeof r.statusText === "string" &&
    utils.isObject(r.headers) &&
    utils.isObject(r.config) &&
    // headers is the only required field of InternalFaxiosRequestConfig.
    utils.hasOwnProp(r.config, "headers") &&
    utils.isObject((r.config as Record<string, unknown>).headers)
  );
}

export function isSchemaValidationError(err: unknown): err is SchemaValidationError {
  const e = err as Record<string, unknown>;
  return (
    utils.isObject(err) &&
    e.isFaxiosError === true &&
    typeof e.code === "string" &&
    SCHEMA_ERROR_CODES.has(e.code) &&
    Array.isArray(e.issues) &&
    (e.code !== FaxiosError.ERR_BAD_RESPONSE_SCHEMA || isFaxiosResponse(e.response))
  );
}

export default FaxiosError;
