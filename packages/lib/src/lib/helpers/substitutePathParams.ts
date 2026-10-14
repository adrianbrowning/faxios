import FaxiosError from "../core/FaxiosError.js";
import type { InternalFaxiosRequestConfig } from "../types.js";

// `.` and `..` (raw or percent-encoded) would become a dot segment that the URL parser resolves,
// moving the request to another path.
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

/**
 * Expects raw (unencoded) param values — applies encodeURIComponent here. A placeholder it can't
 * fill throws `ERR_BAD_OPTION_VALUE` carrying `config`.
 *
 * Each value becomes a non-empty run of encodeURIComponent's output (`A-Za-z0-9-_.!~*'()` and
 * `%XX`), none of which is a URL delimiter (`: / \ ? # @ [ ]`). So substitution keeps every
 * delimiter of the template and keeps them apart: a template's scheme and authority stay where
 * they are, and only a placeholder written inside them can change the origin.
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
    // An empty value would join the delimiters around it (`/{x}/host` → `//host`).
    if (str === "") {
      throw new FaxiosError(`Path param "${key}" must not be empty`, FaxiosError.ERR_BAD_OPTION_VALUE, config);
    }
    if (DOT_SEGMENT.test(str)) {
      throw new FaxiosError(`Path param "${key}" must not be "." or ".." (or a percent-encoded form)`, FaxiosError.ERR_BAD_OPTION_VALUE, config);
    }
    return encodeURIComponent(str);
  });
}
