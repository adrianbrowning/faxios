// @ts-self-types="./mergeConfig.d.ts" — required for Deno: index.ts re-exports mergeConfig
"use strict";

import type { FaxiosDefaults, FaxiosRequestConfig } from "../types.js";
import { hasOwnProp, isArray, isDangerousKey, isPlainObject, isUndefined, merge } from "../utils.js";
import FaxiosHeaders from "./FaxiosHeaders.js";

const headersToObject = (thing: unknown) => (thing instanceof FaxiosHeaders ? { ...thing } : thing);

type MergeInput = FaxiosDefaults | FaxiosRequestConfig | Record<string, unknown>;

/**
 * Config-specific merge-function which creates a new config-object
 * by merging two configuration objects together.
 *
 * @param {Object} config1
 * @param {Object} config2
 *
 * @returns {Object} New object resulting from merging config2 to config1
 */
export default function mergeConfig(config1: MergeInput, config2?: MergeInput): FaxiosRequestConfig & Record<string, unknown> {
  return mergeConfigs(config1, config2 || {}, false);
}

/**
 * mergeConfig() without `headers`: request() layers headers itself, per method, so a deep merge
 * of them would only be discarded.
 */
export function mergeConfigExceptHeaders(config1: FaxiosDefaults | FaxiosRequestConfig, config2?: FaxiosRequestConfig): FaxiosRequestConfig & Record<string, unknown> {
  return mergeConfigs(config1, config2 || {}, true);
}

type MergeFn = (a: unknown, b: unknown, prop: string, config1: MergeInput, config2: MergeInput) => unknown;

function getMergedValue(target: unknown, source: unknown, caseless?: boolean): unknown {
  if (isPlainObject(target) && isPlainObject(source)) {
    return merge.call({ caseless }, target, source);
  }
  else if (isPlainObject(source)) {
    return merge({}, source);
  }
  else if (isArray(source)) {
    return source.slice();
  }
  return source;
}

function mergeDeepProperties(a: unknown, b: unknown, caseless?: boolean): unknown {
  if (!isUndefined(b)) {
    return getMergedValue(a, b, caseless);
  }
  else if (!isUndefined(a)) {
    return getMergedValue(undefined, a, caseless);
  }
  return undefined;
}

function valueFromConfig2(_a: unknown, b: unknown): unknown {
  if (!isUndefined(b)) {
    return getMergedValue(undefined, b);
  }
  return undefined;
}

// An own `undefined` in config2 is treated as unset, so config1's value applies.
function defaultToConfig2(a: unknown, b: unknown): unknown {
  if (!isUndefined(b)) {
    return getMergedValue(undefined, b);
  }
  else if (!isUndefined(a)) {
    return getMergedValue(undefined, a);
  }
  return undefined;
}

// One descriptor for every ownCopy slot: defineProperty reads it at the call, and its null
// prototype keeps a polluted Object.prototype.get from turning a slot into an accessor.
const DATA_SLOT: PropertyDescriptor = Object.assign(Object.create(null) as PropertyDescriptor, {
  value: undefined,
  enumerable: true,
  writable: true,
  configurable: true,
});

// Shallow own-key copy into a null-prototype object, later sources winning. Every own key is
// kept, including `constructor`, `prototype` and `__proto__`: `params` are caller data that
// reach the query string, and defineProperty stores them as plain data slots.
function ownCopy(...sources: Array<unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    const record = source as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      DATA_SLOT.value = record[key];
      Object.defineProperty(out, key, DATA_SLOT);
    }
  }
  DATA_SLOT.value = undefined;
  return out;
}

// `params`: a plain object is copied with every own key; anything else (URLSearchParams,
// a custom serializer's input) passes through as given.
function mergeParams(a: unknown, b: unknown): unknown {
  const source = isUndefined(b) ? a : b;
  if (!isPlainObject(source)) return source;
  return isUndefined(b) ? ownCopy(a) : ownCopy(a, b);
}

// `env`: shallow, null-prototype, so `fetch`, `Request` and `Response` can only be own values.
function mergeEnv(a: unknown, b: unknown): unknown {
  if (isUndefined(a) && isUndefined(b)) return undefined;
  return ownCopy(a, b);
}

// `redact`: a request's keys add to the instance's, so a per-request list can't unmask an
// instance key. Lower-cased and deduplicated, as toJSON() matches them case-insensitively.
function mergeRedact(a: unknown, b: unknown): unknown {
  if (isUndefined(a) && isUndefined(b)) return undefined;
  const keys = new Set<string>();
  for (const list of [ a, b ]) {
    if (!isArray(list)) continue;
    for (const key of list) if (typeof key === "string") keys.add(key.toLowerCase());
  }
  return [ ...keys ];
}

function getMergedTransitionalOption(prop: string, config1: MergeInput, config2: MergeInput): unknown {
  const transitional2 = hasOwnProp(config2, "transitional") ? (config2 as Record<string, unknown>)["transitional"] : undefined;

  if (!isUndefined(transitional2)) {
    if (isPlainObject(transitional2)) {
      if (hasOwnProp(transitional2, prop)) {
        return (transitional2 as Record<string, unknown>)[prop];
      }
    }
    else {
      return undefined;
    }
  }

  const transitional1 = hasOwnProp(config1, "transitional") ? (config1 as Record<string, unknown>)["transitional"] : undefined;

  if (isPlainObject(transitional1) && hasOwnProp(transitional1, prop)) {
    return (transitional1 as Record<string, unknown>)[prop];
  }

  return undefined;
}

function mergeDirectKeys(a: unknown, b: unknown, prop: string, config1: MergeInput, config2: MergeInput): unknown {
  if (hasOwnProp(config2, prop)) {
    return getMergedValue(a, b);
  }
  else if (hasOwnProp(config1, prop)) {
    return getMergedValue(undefined, a);
  }
  return undefined;
}

const mergeMap: Record<string, MergeFn> = Object.assign(Object.create(null) as Record<string, MergeFn>, {
  url: valueFromConfig2,
  method: valueFromConfig2,
  // The body is passed by reference: faxios never mutates it, and copying would drop keys such
  // as `constructor` and cost a deep clone per request.
  data: (_a: unknown, b: unknown) => b,
  params: mergeParams,
  env: mergeEnv,
  redact: mergeRedact,
  baseURL: defaultToConfig2,
  transformRequest: defaultToConfig2,
  transformResponse: defaultToConfig2,
  paramsSerializer: defaultToConfig2,
  timeout: defaultToConfig2,
  timeoutErrorMessage: defaultToConfig2,
  withCredentials: defaultToConfig2,
  withXSRFToken: defaultToConfig2,
  responseType: defaultToConfig2,
  // Clearing the XSRF names is meaningful (no cookie read, no header sent), so an own undefined
  // wins over config1 here; everywhere else it falls back.
  xsrfCookieName: mergeDirectKeys,
  xsrfHeaderName: mergeDirectKeys,
  onUploadProgress: defaultToConfig2,
  onDownloadProgress: defaultToConfig2,
  maxContentLength: defaultToConfig2,
  maxBodyLength: defaultToConfig2,
  responseSchema: defaultToConfig2,
  requestSchema: defaultToConfig2,
  paramsSchema: defaultToConfig2,
  pathParams: defaultToConfig2,
  pathParamsSchema: defaultToConfig2,
  validateStatus: mergeDirectKeys,
  headers: (a: unknown, b: unknown) => mergeDeepProperties(headersToObject(a), headersToObject(b), true),
});

// Keys with no entry in mergeMap: deep-merged, case-sensitively.
const mergeDeep: MergeFn = (a, b) => mergeDeepProperties(a, b);

const { propertyIsEnumerable } = Object.prototype;

function mergeConfigs(config1: MergeInput, config2: MergeInput, skipHeaders: boolean): FaxiosRequestConfig & Record<string, unknown> {
  // Use a null-prototype object so that downstream reads such as `config.auth`
  // or `config.baseURL` cannot inherit polluted values from Object.prototype.
  // `hasOwnProperty` is restored as a non-enumerable own slot to preserve
  // ergonomics for user code that relies on it.
  const config = Object.create(null);
  Object.defineProperty(config, "hasOwnProperty",
    // Null-proto descriptor so a polluted Object.prototype.get cannot turn
    // this data descriptor into an accessor descriptor on the way in.
    Object.assign(Object.create(null) as PropertyDescriptor, {
      value: Object.prototype.hasOwnProperty,
      enumerable: false,
      writable: true,
      configurable: true,
    })
  );

  const c1 = config1 as Record<string, unknown>;
  const c2 = config2 as Record<string, unknown>;
  const out = config as Record<string, unknown>;

  const computeConfigValue = (key: string): void => {
    if (isDangerousKey(key) || skipHeaders && key === "headers") return;
    const mergeFn = mergeMap[key] ?? mergeDeep;
    const a = hasOwnProp(config1, key) ? c1[key] : undefined;
    const b = hasOwnProp(config2, key) ? c2[key] : undefined;
    const configValue = mergeFn(a, b, key, config1, config2);
    (isUndefined(configValue) && mergeFn !== mergeDirectKeys) || (out[key] = configValue);
  };

  // config1's enumerable keys, then config2's that config1 doesn't list: the order a spread of
  // both would give, without copying either.
  for (const key of Object.keys(config1)) computeConfigValue(key);
  for (const key of Object.keys(config2)) {
    if (!propertyIsEnumerable.call(config1, key)) computeConfigValue(key);
  }

  // An own `validateStatus: undefined` falls back to config1's validator like any other own
  // undefined, unless `transitional.validateStatusUndefinedResolves` opts back in to resolving
  // every status. `validateStatus: null` is the explicit way to resolve every status.
  if (
    hasOwnProp(config2, "validateStatus") &&
    isUndefined((config2).validateStatus) &&
    getMergedTransitionalOption("validateStatusUndefinedResolves", config1, config2) !== true
  ) {
    if (hasOwnProp(config1, "validateStatus")) {
      out["validateStatus"] = getMergedValue(undefined, (config1).validateStatus);
    }
    else {
      delete out["validateStatus"];
    }
  }

  return config;
}
