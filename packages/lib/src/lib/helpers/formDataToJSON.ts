"use strict";

import FaxiosError from "../core/FaxiosError.js";
import utils from "../utils.js";
import { DEFAULT_FORM_DATA_MAX_DEPTH } from "./toFormData.js";

const MAX_DEPTH = DEFAULT_FORM_DATA_MAX_DEPTH;

function throwIfDepthExceeded(index: number): void {
  if (index > MAX_DEPTH) {
    throw new FaxiosError(
      "FormData field is too deeply nested (" + index + " levels). Max depth: " + MAX_DEPTH,
      FaxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED
    );
  }
}

/**
 * It takes a string like `foo[x][y][z]` and returns an array like `['foo', 'x', 'y', 'z']
 *
 * @param {string} name - The name of the property to get.
 *
 * @returns An array of strings.
 */
function parsePropPath(name: string): Array<string> {
  // foo[x][y][z]
  // foo.x.y.z
  // foo-x-y-z
  // foo x y z
  const path: Array<string> = [];
  const pattern = /\w+|\[(\w*)]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(name)) !== null) {
    throwIfDepthExceeded(path.length);
    path.push(match[0] === "[]" ? "" : (match[1] ?? match[0]));
  }

  return path;
}

/**
 * Convert an array to an object.
 *
 * @param {Array<any>} arr - The array to convert to an object.
 *
 * @returns An object with the same keys and values as the array.
 */
function arrayToObject(arr: Array<unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  const keys = Object.keys(arr);
  let i: number;
  const len = keys.length;
  let key: string;
  for (i = 0; i < len; i++) {
    key = keys[i]!;
    obj[key] = (arr as unknown as Record<string, unknown>)[key];
  }
  return obj;
}

/**
 * It takes a FormData object and returns a JavaScript object
 *
 * @param {string} formData The FormData object to convert to JSON.
 *
 * @returns {Object<string, any> | null} The converted object.
 */
function formDataToJSON(formData: unknown): Record<string, unknown> | null {
  function buildPath(path: Array<string>, value: unknown, target: Record<string, unknown>, index: number): boolean {
    throwIfDepthExceeded(index);

    let name: string | number = path[index++]!;

    if (name === "__proto__") return true;

    const isNumericKey = Number.isFinite(+name);
    const isLast = index >= path.length;
    name = !name && utils.isArray(target) ? (target as Array<unknown>).length : name;

    const key = String(name);

    if (isLast) {
      if (utils.hasOwnProp(target, key)) {
        target[key] = utils.isArray(target[key])
          ? (target[key] as Array<unknown>).concat(value)
          : [ target[key], value ];
      }
      else {
        target[key] = value;
      }

      return !isNumericKey;
    }

    if (!utils.hasOwnProp(target, key) || !utils.isObject(target[key])) {
      target[key] = [];
    }

    const result = buildPath(path, value, target[key] as Record<string, unknown>, index);

    if (result && utils.isArray(target[key])) {
      target[key] = arrayToObject(target[key] as Array<unknown>);
    }

    return !isNumericKey;
  }

  if (utils.isFormData(formData) && utils.isFunction((formData as { entries?: unknown; }).entries)) {
    const obj: Record<string, unknown> = {};

    utils.forEachEntry(formData, (name: unknown, value: unknown) => {
      buildPath(parsePropPath(name as string), value, obj, 0);
    });

    return obj;
  }

  return null;
}

export default formDataToJSON;
