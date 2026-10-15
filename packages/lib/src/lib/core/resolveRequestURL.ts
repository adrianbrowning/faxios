// @ts-self-types="./resolveRequestURL.d.ts" — required for Deno: re-exported from src/index.ts
import buildURL from "../helpers/buildURL.js";
import { substitutePathParams } from "../helpers/substitutePathParams.js";
import type { FaxiosRequestConfig, InternalFaxiosRequestConfig } from "../types.js";
import { hasOwnProp } from "../utils.js";
import buildFullPath from "./buildFullPath.js";
import FaxiosError from "./FaxiosError.js";

/**
 * Resolve the URL a request is sent to: `url` with its `{key}` placeholders filled from
 * `pathParams`, then `baseURL` + `url` (honouring `allowAbsoluteUrls`), then `params` serialized
 * with `paramsSerializer`. The one resolver: dispatch calls it once per request and hands the
 * result to the adapter, `getUri()` calls it, and plugins import it from the package root to see
 * the URL a request goes to. Schemas are not run here: on the request path `pathParams` and
 * `params` already hold the schema output; elsewhere they are used as given.
 *
 * Throws a `FaxiosError`: `ERR_BAD_OPTION_VALUE` for a placeholder `pathParams` can't fill,
 * `ERR_INVALID_URL` for an absolute `url` with a `baseURL` and `allowAbsoluteUrls: false`.
 *
 * Reads only own properties so inherited values (e.g. `Object.prototype.baseURL`) are ignored.
 */
export default function resolveRequestURL(config: FaxiosRequestConfig): string {
  const own = (key: string): unknown =>
    hasOwnProp(config, key)
      ? (config as Record<string, unknown>)[key]
      : undefined;
  const internal = config as InternalFaxiosRequestConfig;

  let url = own("url");
  const pathParams = own("pathParams");
  if (pathParams !== undefined && typeof url === "string") {
    try {
      url = substitutePathParams(url, pathParams ?? {}, internal);
    }
    catch (err) {
      // substitutePathParams' own errors are already coded; anything else (a value whose
      // toString throws) gets the code.
      if (err instanceof FaxiosError) throw err;
      throw FaxiosError.from(err instanceof Error ? err : new Error(String(err)), FaxiosError.ERR_BAD_OPTION_VALUE, internal);
    }
  }

  const fullPath = buildFullPath(own("baseURL"), url, own("allowAbsoluteUrls"), config);
  // With no url and no baseURL there is nothing to add params to; the adapter rejects the
  // request with ERR_INVALID_URL.
  return typeof fullPath === "string" ? buildURL(fullPath, own("params"), own("paramsSerializer")) : fullPath;
}
