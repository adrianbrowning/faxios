import buildURL from "../helpers/buildURL.js";
import { substitutePathParams } from "../helpers/substitutePathParams.js";
import type { FaxiosRequestConfig, InternalFaxiosRequestConfig } from "../types.js";
import utils from "../utils.js";
import buildFullPath from "./buildFullPath.js";
import FaxiosError from "./FaxiosError.js";

/**
 * Resolve the URL a request is sent to: `url` with its `{key}` placeholders filled from
 * `pathParams`, then `baseURL` + `url` (honouring `allowAbsoluteUrls`), then `params` serialized
 * with `paramsSerializer`. Shared by `getUri()` and the request path so both produce the same
 * string. Schemas are not run here: on the request path `pathParams` already holds the schema
 * output; `getUri()` uses `pathParams` as given.
 *
 * Reads only own properties so inherited values (e.g. `Object.prototype.baseURL`) are ignored.
 */
export default function resolveRequestURL(config: FaxiosRequestConfig): string {
  const own = (key: string): unknown =>
    utils.hasOwnProp(config, key)
      ? (config as Record<string, unknown>)[key]
      : undefined;

  let url = own("url");
  const pathParams = own("pathParams");
  if (pathParams !== undefined && typeof url === "string") {
    try {
      url = substitutePathParams(url, pathParams as Record<string, unknown>);
    }
    catch (err) {
      throw FaxiosError.from(
        err instanceof Error ? err : new Error(String(err)),
        FaxiosError.ERR_BAD_OPTION_VALUE, config as InternalFaxiosRequestConfig
      );
    }
  }

  const fullPath = buildFullPath(own("baseURL"), url, own("allowAbsoluteUrls"), config);
  // With no url and no baseURL there is nothing to add params to; the adapter rejects the
  // request with ERR_INVALID_URL.
  return typeof fullPath === "string" ? buildURL(fullPath, own("params"), own("paramsSerializer")) : fullPath;
}
