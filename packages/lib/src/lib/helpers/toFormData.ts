"use strict";

import FaxiosError from "../core/FaxiosError.js";
// temporary hotfix to avoid circular references until FaxiosURLSearchParams is refactored
import type { GenericFormData, SerializerVisitor, FormDataVisitorHelpers } from "../types.js";
import utils from "../utils.js";

// Default nesting limit shared with the inverse transform (formDataToJSON) so
// the FormData <-> JSON round-trip stays symmetric.
export const DEFAULT_FORM_DATA_MAX_DEPTH = 100;

/**
 * Determines if the given thing is a array or js object.
 *
 * @param {string} thing - The object or array to be visited.
 *
 * @returns {boolean}
 */
function isVisitable(thing: unknown): boolean {
  return utils.isPlainObject(thing) || utils.isArray(thing);
}

/**
 * It removes the brackets from the end of a string
 *
 * @param {string} key - The key of the parameter.
 *
 * @returns {string} the key without the brackets.
 */
function removeBrackets(key: string): string {
  return utils.endsWith(key, "[]") ? key.slice(0, -2) : key;
}

/**
 * It takes a path, a key, and a boolean, and returns a string
 *
 * @param {string} path - The path to the current key.
 * @param {string} key - The key of the current object being iterated over.
 * @param {string} dots - If true, the key will be rendered with dots instead of brackets.
 *
 * @returns {string} The path to the current key.
 */
function renderKey(path: Array<string | number> | null | undefined, key: string | number, dots: unknown): string {
  if (!path) return String(key);
  return path
    .concat(key)
    .map(function each(token: string | number, i: number) {
      token = removeBrackets(String(token));
      return !dots && i ? "[" + token + "]" : token;
    })
    .join(dots ? "." : "");
}

/**
 * If the array is an array and none of its elements are visitable, then it's a flat array.
 *
 * @param {Array<any>} arr - The array to check
 *
 * @returns {boolean}
 */
function isFlatArray(arr: unknown): boolean {
  return utils.isArray(arr) && !(arr as Array<unknown>).some(isVisitable);
}

const predicates = utils.toFlatObject(utils, {}, null as unknown as false, function filter(prop: string) {
  return /^is[A-Z]/.test(prop);
});

/**
 * Convert a data object to FormData
 *
 * @param {Object} obj
 * @param {?Object} [formData]
 * @param {?Object} [options]
 * @param {Function} [options.visitor]
 * @param {Boolean} [options.metaTokens = true]
 * @param {Boolean} [options.dots = false]
 * @param {?Boolean} [options.indexes = false]
 *
 * @returns {Object}
 **/

/**
 * It converts an object into a FormData object
 *
 * @param {Object<any, any>} obj - The object to convert to form data.
 * @param {string} formData - The FormData object to append to.
 * @param {Object<string, any>} options
 *
 * @returns
 */
function toFormData(obj: unknown, formData?: GenericFormData | null, options?: Record<string, unknown>): GenericFormData {
  if (!utils.isObject(obj)) {
    throw new TypeError("target must be an object");
  }

  const FormDataCtor = (globalThis as Record<string, unknown>)["FormData"] as (new () => GenericFormData) | undefined;
  if (!formData) {
    if (!FormDataCtor) throw new FaxiosError("FormData is not available in this environment", FaxiosError.ERR_NOT_SUPPORT);
    formData = new FormDataCtor();
  }

  options = utils.toFlatObject(
    options,
    {
      metaTokens: true,
      dots: false,
      indexes: false,
    },
    false,
    function defined(option: string, source: unknown) {
      return !utils.isUndefined((source as Record<string, unknown>)[option]);
    }
  );

  const metaTokens = options["metaTokens"];

  const visitor = (options["visitor"] || defaultVisitor) as SerializerVisitor;
  const dots = options["dots"];
  const indexes = options["indexes"];
  const _Blob = options["Blob"] || (typeof (globalThis as Record<string, unknown>)["Blob"] !== "undefined" && (globalThis as Record<string, unknown>)["Blob"]);
  const maxDepth =
    options["maxDepth"] === undefined
      ? DEFAULT_FORM_DATA_MAX_DEPTH
      : (options["maxDepth"] as number);
  const useBlob = _Blob && utils.isSpecCompliantForm(formData);
  const stack: Array<unknown> = [];

  if (!utils.isFunction(visitor)) {
    throw new TypeError("visitor must be a function");
  }

  function convertValue(value: unknown): unknown {
    if (value === null) return "";

    if (utils.isDate(value)) {
      return (value as Date).toISOString();
    }

    if (utils.isBoolean(value)) {
      return String(value);
    }

    if (!useBlob && utils.isBlob(value)) {
      throw new FaxiosError("Blob is not supported. Use a Buffer instead.");
    }

    if (utils.isArrayBuffer(value) || utils.isTypedArray(value)) {
      const BlobCtor = (globalThis as Record<string, unknown>)["Blob"] as (new (parts: Array<unknown>) => unknown) | undefined;
      if (useBlob && typeof BlobCtor === "function") {
        return new BlobCtor([ value ]);
      }
      throw new FaxiosError("Blob is required for binary FormData values in this environment", FaxiosError.ERR_NOT_SUPPORT);
    }

    return value;
  }

  function throwIfMaxDepthExceeded(depth: number): void {
    if (depth > (maxDepth)) {
      throw new FaxiosError(
        "Object is too deeply nested (" +
          depth +
          " levels). Max depth: " +
          maxDepth,
        FaxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED
      );
    }
  }

  function stringifyWithDepthLimit(value: unknown, depth: number): string {
    if (maxDepth === Infinity) {
      return JSON.stringify(value);
    }

    const ancestors: Array<unknown> = [];

    return JSON.stringify(value, function limitDepth(this: unknown, _key: string, currentValue: unknown): unknown {
      if (!utils.isObject(currentValue)) {
        return currentValue;
      }

      while (ancestors.length && ancestors[ancestors.length - 1] !== this) {
        ancestors.pop();
      }

      ancestors.push(currentValue);
      throwIfMaxDepthExceeded(depth + ancestors.length - 1);

      return currentValue;
    });
  }

  /**
   * Default visitor.
   *
   * @param {*} value
   * @param {String|Number} key
   * @param {Array<String|Number>} path
   * @this {FormData}
   *
   * @returns {boolean} return true to visit the each prop of the value recursively
   */
  function defaultVisitor(this: GenericFormData, value: unknown, key: string | number, path: null | Array<string | number>, _helpers?: FormDataVisitorHelpers): boolean {
    let arr: unknown = value;

    if (utils.isReactNative(formData) && utils.isReactNativeBlob(value)) {
      (formData as GenericFormData).append(renderKey(path, key, dots), convertValue(value));
      return false;
    }

    if (value && !path && typeof value === "object") {
      if (utils.endsWith(String(key), "{}")) {
        key = metaTokens ? key : String(key).slice(0, -2);

        value = stringifyWithDepthLimit(value, 1);
      }
      else if (
        (utils.isArray(value) && isFlatArray(value)) ||
        ((utils.isFileList(value) || utils.endsWith(String(key), "[]")) &&
          (arr = utils.toArray(value)))
      ) {
        key = removeBrackets(String(key));

        (arr as Array<unknown>).forEach(function each(el: unknown, index: number) {
          !(utils.isUndefined(el) || el === null) &&
            (formData as GenericFormData).append(
              /* eslint-disable sonarjs/no-nested-conditional */
              indexes === true
                ? renderKey([ String(key) ], index, dots)
                : indexes === null
                  ? String(key)
                  : String(key) + "[]",
              /* eslint-enable sonarjs/no-nested-conditional */
              convertValue(el)
            );
        });
        return false;
      }
    }

    if (isVisitable(value)) {
      return true;
    }

    (formData as GenericFormData).append(renderKey(path, key, dots), convertValue(value));

    return false;
  }

  const exposedHelpers: FormDataVisitorHelpers = Object.assign(predicates, {
    defaultVisitor: defaultVisitor,
    convertValue,
    isVisitable,
  });

  function build(value: unknown, path?: Array<string | number>, depth = 0): void {
    if (utils.isUndefined(value)) return;

    throwIfMaxDepthExceeded(depth);

    if (stack.indexOf(value) !== -1) {
      throw new Error("Circular reference detected in " + (path ?? []).join("."));
    }

    stack.push(value);

    utils.forEach(value, function each(el: unknown, key: unknown) {
      const result =
        !(utils.isUndefined(el) || el === null) &&
        visitor.call(
          formData as GenericFormData,
          el,
          utils.isString(key) ? (key as string).trim() : key as string | number,
          path ?? null,
          exposedHelpers
        );

      if (result === true) {
        build(el, path ? path.concat(key as string | number) : [ key as string | number ], depth + 1);
      }
    });

    stack.pop();
  }

  if (!utils.isObject(obj)) {
    throw new TypeError("data must be an object");
  }

  build(obj);

  return formData;
}

export default toFormData;
