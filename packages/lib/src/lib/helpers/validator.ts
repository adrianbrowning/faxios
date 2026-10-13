"use strict";

import FaxiosError from "../core/FaxiosError.js";

export type ValidatorFn = (value: unknown, opt?: string, opts?: unknown) => boolean | string;

const validators = {
  boolean: (thing: unknown): boolean | string => typeof thing === "boolean" || "a boolean",
  function: (thing: unknown): boolean | string => typeof thing === "function" || "a function",
} as const satisfies Record<string, ValidatorFn>;

/**
 * Assert object's properties type
 *
 * @param {object} options
 * @param {object} schema
 * @param {boolean?} allowUnknown
 *
 * @returns {object}
 */

function assertOptions(options: unknown, schema: Readonly<Record<string, undefined | ValidatorFn>>, allowUnknown: boolean): void {
  if (options === null || typeof options !== "object") {
    throw new FaxiosError("options must be an object", FaxiosError.ERR_BAD_OPTION_VALUE);
  }
  const keys = Object.keys(options);
  let i = keys.length;
  while (i-- > 0) {
    const opt = keys[i]!;
    // Use hasOwnProperty so a polluted Object.prototype.<opt> cannot supply
    // a non-function validator and cause a TypeError.
    const validator = Object.prototype.hasOwnProperty.call(schema, opt) ? schema[opt] : undefined;
    if (validator) {
      const value = (options as Record<string, unknown>)[opt];
      const result = value === undefined || validator(value, opt, options);
      if (result !== true) {
        throw new FaxiosError(
          "option " + opt + " must be " + result,
          FaxiosError.ERR_BAD_OPTION_VALUE
        );
      }
      continue;
    }
    if (allowUnknown !== true) {
      throw new FaxiosError("Unknown option " + opt, FaxiosError.ERR_BAD_OPTION);
    }
  }
}

export default {
  assertOptions,
  validators,
};
