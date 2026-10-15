// Helpers the built-in plugins share. Like the plugins, they use only what the package root
// exports, which is what a third-party plugin can import, so a plugin of your own can do anything
// these do. Not an entry point.

import type { InternalFaxiosRequestConfig } from "../../index.js";
import FaxiosError from "../core/FaxiosError.js";
import resolveRequestURL from "../core/resolveRequestURL.js";

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
