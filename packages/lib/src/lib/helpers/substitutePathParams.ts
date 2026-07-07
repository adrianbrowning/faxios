export function substitutePathParams(url: string, params: Record<string, unknown>): string {
  return url.replace(/\{([^{}]+)\}/g, (_match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      throw new Error(`Path param "${key}" not found in pathParams`);
    }
    const val = params[key];
    if (val == null) {
      throw new Error(`Path param "${key}" is null or undefined`);
    }
    return encodeURIComponent(String(val));
  });
}
