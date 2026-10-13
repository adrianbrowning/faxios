import buildURL from "../helpers/buildURL.js";
import type { FaxiosRequestConfig } from "../types.js";
import utils from "../utils.js";
import buildFullPath from "./buildFullPath.js";

/**
 * Resolve the URL a request is sent to: `baseURL` + `url` (honouring `allowAbsoluteUrls`),
 * then `params` serialized with `paramsSerializer`. Shared by `getUri()` and the request path
 * so both produce the same string.
 *
 * Reads only own properties so inherited values (e.g. `Object.prototype.baseURL`) are ignored.
 */
export default function resolveRequestURL(config: FaxiosRequestConfig): string {
  const own = (key: string): unknown =>
    utils.hasOwnProp(config, key)
      ? (config as Record<string, unknown>)[key]
      : undefined;

  return buildURL(
    buildFullPath(own("baseURL"), own("url"), own("allowAbsoluteUrls"), config),
    own("params"),
    own("paramsSerializer")
  );
}
