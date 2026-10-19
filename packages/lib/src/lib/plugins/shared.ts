// Helpers the built-in plugins share. Like the plugins, they use only what the package root
// exports, which is what a third-party plugin can import, so a plugin of your own can do anything
// these do. Not an entry point.

import type { InternalFaxiosRequestConfig } from "../../index.js";
import FaxiosError from "../core/FaxiosError.js";
import resolveRequestURL from "../core/resolveRequestURL.js";
import { hasOwnInPrototypeChain } from "../utils.js";

/** A caller-supplied field, read as an own property only (THREATMODEL T-R4b). */
export const own = <T extends object, K extends keyof T>(source: T, key: K): T[K] | undefined =>
  (Object.hasOwn(source, key) ? source[key] : undefined);

/** A token (RFC 9110 §5.6.2): what a header name and an HTTP method (§9.1) must be. */
export const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * The URL a request goes to with its `{key}` placeholders left in, from core's resolver without
 * `pathParams` and `params` (the caller's paramsSerializer isn't run again). `undefined` when core
 * would reject the URL; a non-string result is `""`.
 */
export function templateURL(config: InternalFaxiosRequestConfig): string | undefined {
  let resolved: unknown;
  try {
    resolved = resolveRequestURL({ ...config, pathParams: undefined, params: undefined });
  }
  catch {
    return undefined;
  }
  return typeof resolved === "string" ? resolved : "";
}

/** Checks one option value: `true` when it is valid, else what it must be ("a boolean"). */
export type OptionCheck = (value: unknown) => boolean | string;

export const isBoolean: OptionCheck = value => typeof value === "boolean" || "a boolean";
export const isFunction: OptionCheck = value => typeof value === "function" || "a function";
export const isHeaderName: OptionCheck = value => (typeof value === "string" && TOKEN.test(value)) || "a header name";

const isStatus = (value: unknown) => Number.isInteger(value) && (value as number) >= 100 && (value as number) <= 599;
export const isStatusList: OptionCheck = value => (Array.isArray(value) && value.every(isStatus)) || "an array of HTTP status codes (100-599)";

/**
 * Rejects plugin options that aren't an object (`ERR_BAD_OPTION_VALUE`), have a key the schema
 * doesn't list (`ERR_BAD_OPTION`) or a value its check refuses (`ERR_BAD_OPTION_VALUE`). An own
 * `undefined` means "not set". `plugin` names the plugin in the message for a non-object.
 */
export function assertOptions(value: unknown, schema: Readonly<Record<string, OptionCheck>>, plugin: string, config?: InternalFaxiosRequestConfig): asserts value is object {
  if (value === null || typeof value !== "object") {
    throw new FaxiosError(`${plugin} options must be an object`, FaxiosError.ERR_BAD_OPTION_VALUE, config);
  }
  for (const [ key, option ] of Object.entries(value)) {
    const check = Object.hasOwn(schema, key) ? schema[key] : undefined;
    if (!check) throw new FaxiosError(`Unknown option ${key}`, FaxiosError.ERR_BAD_OPTION, config);
    const result = option === undefined || check(option);
    if (result !== true) throw new FaxiosError(`option ${key} must be ${String(result)}`, FaxiosError.ERR_BAD_OPTION_VALUE, config);
  }
}

// A stream is consumed by the first try, so sending it again would send nothing.
// The same stream checks the fetch adapter uses: web ReadableStreams, Node-style pipe streams and
// async iterables (such as async generators), whose `pipe` or `Symbol.asyncIterator` the body or
// its class defines. One only a polluted Object.prototype supplies doesn't make a plain object
// body a stream.
const ownMethod = (data: object, key: PropertyKey): boolean =>
  hasOwnInPrototypeChain(data, key) && typeof Reflect.get(data, key) === "function";

/** Whether a request body can be sent again: anything but a stream (see above). */
export function canReplay(data: unknown): boolean {
  if (Object.prototype.toString.call(data) === "[object ReadableStream]") return false;
  if (typeof data !== "object" || data === null) return true;
  return !ownMethod(data, "pipe") && !ownMethod(data, Symbol.asyncIterator);
}

/**
 * Cancels a status error's `responseType: "stream"` body, which holds its connection open until
 * it is read or cancelled, when the error is dropped for another try. One already being read is
 * left alone.
 */
export function discardBody(reason: unknown): void {
  const data: unknown = reason instanceof FaxiosError ? reason.response?.data : undefined;
  if (Object.prototype.toString.call(data) !== "[object ReadableStream]") return;
  const stream = data as InstanceType<typeof ReadableStream>;
  if (!stream.locked) stream.cancel().catch(() => {});
}
