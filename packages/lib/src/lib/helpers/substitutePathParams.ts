import FaxiosError from "../core/FaxiosError.js";

export function substitutePathParams(url: string, params: Record<string, unknown>): string {
  return url.replace(/\{([^{}]+)\}/g, (_match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      throw new FaxiosError(`Path param "${key}" not found in pathParams`, FaxiosError.ERR_BAD_OPTION_VALUE);
    }
    const val = params[key];
    if (val == null) {
      throw new FaxiosError(`Path param "${key}" is null or undefined`, FaxiosError.ERR_BAD_OPTION_VALUE);
    }
    return encodeURIComponent(String(val));
  });
}
