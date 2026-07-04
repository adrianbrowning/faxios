"use strict";

import type { FaxiosRequestConfig, FaxiosDefaults } from "../types.js";
import utils from "../utils.js";
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
export default function mergeConfig(config1: FaxiosRequestConfig | FaxiosDefaults | Record<string, unknown>, config2?: FaxiosRequestConfig | FaxiosDefaults | Record<string, unknown>): FaxiosRequestConfig & Record<string, unknown> {
   
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
    if (utils.isPlainObject(target) && utils.isPlainObject(source)) {
      return utils.merge.call({ caseless }, target, source);
    }
    else if (utils.isPlainObject(source)) {
      return utils.merge({}, source);
    }
    else if (utils.isArray(source)) {
      return source.slice();
    }
    return source;
  }

  function mergeDeepProperties(a: unknown, b: unknown, prop?: unknown, caseless?: unknown): unknown {
    if (!utils.isUndefined(b)) {
      return getMergedValue(a, b, prop, caseless);
    }
    else if (!utils.isUndefined(a)) {
      return getMergedValue(undefined, a, prop, caseless);
    }
    return undefined;
  }

  function valueFromConfig2(_a: unknown, b: unknown): unknown {
    if (!utils.isUndefined(b)) {
      return getMergedValue(undefined, b);
    }
    return undefined;
  }

  function defaultToConfig2(a: unknown, b: unknown, prop?: unknown): unknown {
    if (!utils.isUndefined(b)) {
      return getMergedValue(undefined, b);
    }
    // ponytail: explicit undefined in config2 (e.g. xsrfCookieName: undefined) must win over config1's default
    else if (utils.hasOwnProp(config2, prop as string)) {
      return undefined;
    }
    else if (!utils.isUndefined(a)) {
      return getMergedValue(undefined, a);
    }
    return undefined;
  }

  function getMergedTransitionalOption(prop: string): unknown {
    const c2 = config2 as Record<string, unknown>;
    const c1 = config1 as Record<string, unknown>;
    const transitional2 = utils.hasOwnProp(config2, "transitional") ? c2["transitional"] : undefined;

    if (!utils.isUndefined(transitional2)) {
      if (utils.isPlainObject(transitional2)) {
        if (utils.hasOwnProp(transitional2, prop)) {
          return (transitional2 as Record<string, unknown>)[prop];
        }
      }
      else {
        return undefined;
      }
    }

    const transitional1 = utils.hasOwnProp(config1, "transitional") ? c1["transitional"] : undefined;

    if (utils.isPlainObject(transitional1) && utils.hasOwnProp(transitional1, prop)) {
      return (transitional1 as Record<string, unknown>)[prop];
    }

    return undefined;
  }
   
  function mergeDirectKeys(a: unknown, b: unknown, prop?: unknown): unknown {
    if (utils.hasOwnProp(config2, prop as string)) {
      return getMergedValue(a, b);
    }
    else if (utils.hasOwnProp(config1, prop as string)) {
      return getMergedValue(undefined, a);
    }
    return undefined;
  }

  const mergeMap = {
    url: valueFromConfig2,
    method: valueFromConfig2,
    data: valueFromConfig2,
    baseURL: defaultToConfig2,
    transformRequest: defaultToConfig2,
    transformResponse: defaultToConfig2,
    paramsSerializer: defaultToConfig2,
    timeout: defaultToConfig2,
    timeoutMessage: defaultToConfig2,
    withCredentials: defaultToConfig2,
    withXSRFToken: defaultToConfig2,
    responseType: defaultToConfig2,
    xsrfCookieName: defaultToConfig2,
    xsrfHeaderName: defaultToConfig2,
    onUploadProgress: defaultToConfig2,
    onDownloadProgress: defaultToConfig2,
    maxContentLength: defaultToConfig2,
    maxBodyLength: defaultToConfig2,
    responseEncoding: defaultToConfig2,
    responseSchema: defaultToConfig2,
    validateStatus: mergeDirectKeys,
    headers: (a: unknown, b: unknown, prop?: unknown) =>
      mergeDeepProperties(headersToObject(a), headersToObject(b), prop, true),
  };

  const c1 = config1 as Record<string, unknown>;
  const c2 = config2 as Record<string, unknown>;
  const out = config as Record<string, unknown>;

  utils.forEach(Object.keys({ ...config1, ...config2 }), function computeConfigValue(_value: unknown, _prop: unknown) {
    const key = _value as string;
    if (key === "__proto__" || key === "constructor" || key === "prototype") return;
    const mergeFn = (utils.hasOwnProp(mergeMap, key) ? (mergeMap as Record<string, typeof mergeDeepProperties>)[key] : mergeDeepProperties)!;
    const a = utils.hasOwnProp(config1, key) ? c1[key] : undefined;
    const b = utils.hasOwnProp(config2, key) ? c2[key] : undefined;
    const configValue = mergeFn(a, b, key);
    (utils.isUndefined(configValue) && mergeFn !== mergeDirectKeys) || (out[key] = configValue);
  });

  if (
    utils.hasOwnProp(config2, "validateStatus") &&
    utils.isUndefined((config2).validateStatus) &&
    getMergedTransitionalOption("validateStatusUndefinedResolves") === false
  ) {
    if (utils.hasOwnProp(config1, "validateStatus")) {
      out["validateStatus"] = getMergedValue(undefined, (config1).validateStatus);
    }
    else {
      delete out["validateStatus"];
    }
  }

  return config;
}
