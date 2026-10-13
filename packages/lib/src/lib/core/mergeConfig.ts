// @ts-self-types="./mergeConfig.d.ts" — required for Deno: index.ts re-exports mergeConfig
"use strict";

import type { FaxiosDefaults, FaxiosRequestConfig } from "../types.js";
import { forEach, hasOwnProp, isArray, isDangerousKey, isPlainObject, isUndefined, merge } from "../utils.js";
import FaxiosHeaders from "./FaxiosHeaders.js";

const headersToObject = (thing: unknown) => (thing instanceof FaxiosHeaders ? { ...thing } : thing);

/**
 * Config-specific merge-function which creates a new config-object
 * by merging two configuration objects together.
 *
 * @param {Object} config1
 * @param {Object} config2
 *
 * @returns {Object} New object resulting from merging config2 to config1
 */
export default function mergeConfig(config1: FaxiosDefaults | FaxiosRequestConfig | Record<string, unknown>, config2?: FaxiosDefaults | FaxiosRequestConfig | Record<string, unknown>): FaxiosRequestConfig & Record<string, unknown> {
   
  config2 = config2 || {};

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

  function getMergedValue(target: unknown, source: unknown, _prop?: unknown, caseless?: unknown): unknown {
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

  function mergeDeepProperties(a: unknown, b: unknown, prop?: unknown, caseless?: unknown): unknown {
    if (!isUndefined(b)) {
      return getMergedValue(a, b, prop, caseless);
    }
    else if (!isUndefined(a)) {
      return getMergedValue(undefined, a, prop, caseless);
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

  // Shallow own-key copy into a null-prototype object, later sources winning. Every own key is
  // kept, including `constructor`, `prototype` and `__proto__`: `params` are caller data that
  // reach the query string, and defineProperty stores them as plain data slots.
  function ownCopy(...sources: Array<unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = Object.create(null);
    for (const source of sources) {
      if (!isPlainObject(source)) continue;
      const record = source as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        Object.defineProperty(out, key, Object.assign(Object.create(null) as PropertyDescriptor, {
          value: record[key],
          enumerable: true,
          writable: true,
          configurable: true,
        }));
      }
    }
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

  function getMergedTransitionalOption(prop: string): unknown {
    const c2 = config2 as Record<string, unknown>;
    const c1 = config1 as Record<string, unknown>;
    const transitional2 = hasOwnProp(config2, "transitional") ? c2["transitional"] : undefined;

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

    const transitional1 = hasOwnProp(config1, "transitional") ? c1["transitional"] : undefined;

    if (isPlainObject(transitional1) && hasOwnProp(transitional1, prop)) {
      return (transitional1 as Record<string, unknown>)[prop];
    }

    return undefined;
  }
   
  function mergeDirectKeys(a: unknown, b: unknown, prop?: unknown): unknown {
    if (hasOwnProp(config2, prop as string)) {
      return getMergedValue(a, b);
    }
    else if (hasOwnProp(config1, prop as string)) {
      return getMergedValue(undefined, a);
    }
    return undefined;
  }

  const mergeMap = {
    url: valueFromConfig2,
    method: valueFromConfig2,
    // The body is passed by reference: faxios never mutates it, and copying would drop keys such
    // as `constructor` and cost a deep clone per request.
    data: (_a: unknown, b: unknown) => b,
    params: mergeParams,
    env: mergeEnv,
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
    headers: (a: unknown, b: unknown, prop?: unknown) =>
      mergeDeepProperties(headersToObject(a), headersToObject(b), prop, true),
  };

  const c1 = config1 as Record<string, unknown>;
  const c2 = config2 as Record<string, unknown>;
  const out = config as Record<string, unknown>;

  forEach(Object.keys({ ...config1, ...config2 }), function computeConfigValue(_value: unknown, _prop: unknown) {
    const key = _value as string;
    if (isDangerousKey(key)) return;
    const mergeFn = (hasOwnProp(mergeMap, key) ? (mergeMap as Record<string, typeof mergeDeepProperties>)[key] : mergeDeepProperties)!;
    const a = hasOwnProp(config1, key) ? c1[key] : undefined;
    const b = hasOwnProp(config2, key) ? c2[key] : undefined;
    const configValue = mergeFn(a, b, key);
    (isUndefined(configValue) && mergeFn !== mergeDirectKeys) || (out[key] = configValue);
  });

  // An own `validateStatus: undefined` falls back to config1's validator like any other own
  // undefined, unless `transitional.validateStatusUndefinedResolves` opts back in to resolving
  // every status. `validateStatus: null` is the explicit way to resolve every status.
  if (
    hasOwnProp(config2, "validateStatus") &&
    isUndefined((config2).validateStatus) &&
    getMergedTransitionalOption("validateStatusUndefinedResolves") !== true
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
