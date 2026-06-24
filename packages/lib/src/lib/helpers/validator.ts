"use strict";

import FaxiosError from "../core/FaxiosError.js";
import { VERSION } from "../env/data.js";

export type ValidatorFn = (value: unknown, opt?: string, opts?: unknown) => boolean | string;

const validators: Record<string, ValidatorFn | undefined> = {};

[ "object", "boolean", "number", "function", "string", "symbol" ].forEach((type, i) => {
  // eslint-disable-next-line sonarjs/function-return-type
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
      "[Faxios v" +
      VERSION +
      "] Transitional option '" +
      opt +
      "'" +
      desc +
      (message ? ". " + message : "")
    );
  }

  // eslint-disable-next-line sonarjs/function-return-type
  return (value: unknown, opt?: string, opts?: unknown): boolean | string => {
    if (validator === false) {
      throw new FaxiosError(
        formatMessage(opt ?? "", " has been removed" + (version ? " in " + version : "")),
        FaxiosError.ERR_DEPRECATED
      );
    }

    if (version && opt && !deprecatedWarnings[opt]) {
      deprecatedWarnings[opt] = true;

      // eslint-disable-next-line no-console
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
  // eslint-disable-next-line sonarjs/function-return-type
  return (_value: unknown, opt?: string): boolean | string => {

    // eslint-disable-next-line no-console
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
    throw new FaxiosError("options must be an object", FaxiosError.ERR_BAD_OPTION_VALUE);
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
