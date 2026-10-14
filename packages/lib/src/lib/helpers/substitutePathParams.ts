import FaxiosError from "../core/FaxiosError.js";
import type { InternalFaxiosRequestConfig } from "../types.js";

// `.` and `..` (raw or percent-encoded) would become a dot segment that the URL parser resolves,
// moving the request to another path.
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

/**
 * Expects raw (unencoded) param values — applies encodeURIComponent here. A placeholder it can't
 * fill throws `ERR_BAD_OPTION_VALUE` carrying `config`.
 */
export function substitutePathParams(url: string, params: Record<string, unknown>, config?: InternalFaxiosRequestConfig): string {
  return url.replace(/\{([^{}]+)\}/g, (_match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      throw new FaxiosError(`Path param "${key}" not found in pathParams`, FaxiosError.ERR_BAD_OPTION_VALUE, config);
    }
    const val = params[key];
    if (val == null) {
      throw new FaxiosError(`Path param "${key}" is null or undefined`, FaxiosError.ERR_BAD_OPTION_VALUE, config);
    }
    const str = String(val);
    if (DOT_SEGMENT.test(str)) {
      throw new FaxiosError(`Path param "${key}" must not be "." or ".." (or a percent-encoded form)`, FaxiosError.ERR_BAD_OPTION_VALUE, config);
    }
    return encodeURIComponent(str);
  });
}
