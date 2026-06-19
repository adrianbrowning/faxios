"use strict";

import AxiosError from "../core/AxiosError.js";
import { VERSION } from "../env/data.js";

export type ValidatorFn = (value: unknown, opt?: string, opts?: unknown) => boolean | string;

const validators: Record<string, ValidatorFn | undefined> = {};

[ "object", "boolean", "number", "function", "string", "symbol" ].forEach((type, i) => {
  validators[type] = function validator(thing: unknown): boolean | string {
    return typeof thing === type || "a" + (i < 1 ? "n " : " ") + type;
  };
});

const deprecatedWarnings: Record<string, boolean | undefined> = {};

/**
 * Transitional option validator
 *
 * @param {function|boolean?} validator - set to false if the transitional option has been removed
 * @param {string?} version - deprecated version / removed since version
 * @param {string?} message - some message with additional info
 *
 * @returns {function}
 */
(validators as Record<string, unknown>)["transitional"] = function transitional(validator: ValidatorFn | false | undefined, version?: string, message?: string): ValidatorFn {
  function formatMessage(opt: string, desc: string): string {
    return (
      "[Axios v" +
      VERSION +
      "] Transitional option '" +
      opt +
      "'" +
      desc +
      (message ? ". " + message : "")
    );
  }

  return (value: unknown, opt?: string, opts?: unknown): boolean | string => {
    if (validator === false) {
      throw new AxiosError(
        formatMessage(opt ?? "", " has been removed" + (version ? " in " + version : "")),
        AxiosError.ERR_DEPRECATED
      );
    }

    if (version && opt && !deprecatedWarnings[opt]) {
      deprecatedWarnings[opt] = true;

      console.warn(
        formatMessage(
          opt,
          " has been deprecated since v" + version + " and will be removed in the near future"
        )
      );
    }

    return validator ? validator(value, opt, opts) : true;
  };
};

(validators as Record<string, unknown>)["spelling"] = function spelling(correctSpelling: string): ValidatorFn {
  return (_value: unknown, opt?: string): boolean | string => {

    console.warn(`${opt ?? ""} is likely a misspelling of ${correctSpelling}`);
    return true;
  };
};

/**
 * Assert object's properties type
 *
 * @param {object} options
 * @param {object} schema
 * @param {boolean?} allowUnknown
 *
 * @returns {object}
 */

function assertOptions(options: unknown, schema: Record<string, ValidatorFn | undefined>, allowUnknown: boolean): void {
  if (typeof options !== "object") {
    throw new AxiosError("options must be an object", AxiosError.ERR_BAD_OPTION_VALUE);
  }
  const keys = Object.keys(options as object);
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
        throw new AxiosError(
          "option " + opt + " must be " + result,
          AxiosError.ERR_BAD_OPTION_VALUE
        );
      }
      continue;
    }
    if (allowUnknown !== true) {
      throw new AxiosError("Unknown option " + opt, AxiosError.ERR_BAD_OPTION);
    }
  }
}

export default {
  assertOptions,
  validators,
};
