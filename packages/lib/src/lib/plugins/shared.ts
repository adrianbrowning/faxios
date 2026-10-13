// Helpers the built-in plugins share. Like the plugins, they import only the package root, which is
// what a third-party plugin can import, so a plugin of your own can do anything these do. Not an
// entry point.

import { FaxiosError } from "../../index.js";
import type { InternalFaxiosRequestConfig } from "../../index.js";

/** A caller-supplied field, read as an own property only (THREATMODEL T-R4b). */
export const own = <T extends object, K extends keyof T>(source: T, key: K): T[K] | undefined =>
  (Object.hasOwn(source, key) ? source[key] : undefined);

/** Checks one option value: `true` when it is valid, else what it must be ("a boolean"). */
export type OptionCheck = (value: unknown) => boolean | string;

export const isBoolean: OptionCheck = value => typeof value === "boolean" || "a boolean";
export const isFunction: OptionCheck = value => typeof value === "function" || "a function";

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

export function isAbsoluteURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  }
  catch {
    return false;
  }
}

// Joins with exactly one slash. Scans instead of a regex, which backtracks on a run of slashes.
function combineURLs(baseURL: string, relativeURL: string): string {
  if (!relativeURL) return baseURL;
  let end = baseURL.length;
  while (end > 0 && baseURL.charCodeAt(end - 1) === 47) end--;
  let start = 0;
  while (start < relativeURL.length && relativeURL.charCodeAt(start) === 47) start++;
  return `${baseURL.slice(0, end)}/${relativeURL.slice(start)}`;
}

/**
 * The request URL with `baseURL` applied, the way dispatch applies it (`allowAbsoluteUrls`
 * included), before path params and `params`: `""` when the request has neither.
 */
export function fullPath(config: InternalFaxiosRequestConfig): string {
  const baseURL = own(config, "baseURL");
  const url = own(config, "url");
  const requested = typeof url === "string" ? url : "";
  if (typeof baseURL === "string" && baseURL !== "" && (!isAbsoluteURL(requested) || own(config, "allowAbsoluteUrls") === false)) {
    return combineURLs(baseURL, requested);
  }
  return requested;
}
