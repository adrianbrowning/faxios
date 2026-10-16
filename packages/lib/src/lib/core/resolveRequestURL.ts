// @ts-self-types="./resolveRequestURL.d.ts" — required for Deno: re-exported from src/index.ts
import buildURL from "../helpers/buildURL.js";
import type { FaxiosRequestConfig, InternalFaxiosRequestConfig } from "../types.js";
import { hasOwnProp } from "../utils.js";
import buildFullPath from "./buildFullPath.js";
import FaxiosError from "./FaxiosError.js";
import { substitutePathParams } from "./substitutePathParams.js";

/**
 * A request `url` as the string it is sent as: a `URL` as its `href`, a string or `undefined` as
 * given. Anything else throws `ERR_BAD_OPTION_VALUE`. The one url normalization: request() and
 * getUri() run it before middleware, and resolveRequestURL() on the config it is given.
 */
export function normalizeRequestURL(url: unknown, config: FaxiosRequestConfig): string | undefined {
  if (url instanceof URL) return url.href;
  if (url === undefined || typeof url === "string") return url;
  throw new FaxiosError("option url must be a string or URL", FaxiosError.ERR_BAD_OPTION_VALUE, config as InternalFaxiosRequestConfig);
}

/**
 * Resolve the URL a request is sent to: `url` with its `{key}` placeholders filled from
 * `pathParams`, then `baseURL` + `url` (honouring `allowAbsoluteUrls`), then `params` serialized
 * with `paramsSerializer`. The one resolver: dispatch calls it once per request and hands the
 * result to the adapter, `getUri()` calls it, and plugins import it from the package root to see
 * the URL a request goes to. Schemas are not run here: on the request path `pathParams` and
 * `params` already hold the schema output; elsewhere they are used as given.
 *
 * `allowAbsoluteUrls` is used as given; its default is the caller's to supply, and unset it
 * lets an absolute `url` replace `baseURL`. request() and getUri() supply it from the instance
 * defaults (`false` when the instance has a `baseURL`) before they resolve, so `ctx.config`
 * already holds it.
 *
 * A `URL` url is resolved as its `href`.
 *
 * Throws a `FaxiosError`: `ERR_BAD_OPTION_VALUE` for a url that isn't a string or `URL` and for
 * a placeholder `pathParams` can't fill, `ERR_INVALID_URL` for an absolute `url` with a `baseURL`
 * and `allowAbsoluteUrls: false`, and for a config with neither `url` nor `baseURL`.
 *
 * Reads only own properties so inherited values (e.g. `Object.prototype.baseURL`) are ignored.
 */
export default function resolveRequestURL(config: FaxiosRequestConfig): string {
  const own = (key: string): unknown =>
    hasOwnProp(config, key)
      ? (config as Record<string, unknown>)[key]
      : undefined;
  const internal = config as InternalFaxiosRequestConfig;

  let url = normalizeRequestURL(own("url"), config);
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

  const baseURL = own("baseURL");
  // A truthy non-string baseURL used to fail inside the join with a TypeError.
  if (baseURL && typeof baseURL !== "string") {
    throw new FaxiosError("option baseURL must be a string", FaxiosError.ERR_BAD_OPTION_VALUE, internal);
  }
  const fullPath = buildFullPath(typeof baseURL === "string" ? baseURL : undefined, url, own("allowAbsoluteUrls"), config);
  if (fullPath === undefined) {
    throw new FaxiosError("Invalid URL: no url or baseURL given", FaxiosError.ERR_INVALID_URL, internal);
  }
  return buildURL(fullPath, own("params"), own("paramsSerializer"));
}
