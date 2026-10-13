"use strict";

import type { ParamEncoder } from "../types.js";
import { encodeParam } from "./appendParams.js";
import toFormData from "./toFormData.js";

class FaxiosURLSearchParams {
  #pairs: Array<[string, unknown]> = [];

  constructor(params?: unknown, options?: unknown) {
    params && toFormData(params, this, options as Record<string, unknown>);
  }

  append(name: string, value: unknown): void {
    this.#pairs.push([ name, value ]);
  }

  toString(encoder?: ParamEncoder): string {
    const _encode = encoder
      ? (value: string) => encoder.call(undefined, value, encodeParam)
      : encodeParam;

    return this.#pairs
      .map(function each(pair: [string, unknown]) {
        return _encode(String(pair[0])) + "=" + _encode(String(pair[1]!));
      }, "")
      .join("&");
  }
}

/**
 * The `params` serializer `@gcmdev/faxios/form` installs: toFormData's notation at any depth
 * (`a[b][c]=1`), with the `dots`, `indexes`, `metaTokens`, `maxDepth` and `visitor` options.
 */
export function serializeFormParams(params: unknown, options: unknown, encoder: ParamEncoder): string {
  return new FaxiosURLSearchParams(params, options).toString(encoder);
}

export default FaxiosURLSearchParams;
