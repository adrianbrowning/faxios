// @ts-self-types="./authBearer.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import type { FaxiosPlugin } from "../../index.js";
import FaxiosError from "../core/FaxiosError.js";
import { goesToAPI, isOriginList, originsOption, putCredentials } from "./credentials.js";
import { definePlugin } from "./definePlugin.js";
import { assertOptions, isBoolean, isHeaderName, own } from "./shared.js";

/** What `authBearer` provides to plugins installed after it. */
export type AuthBearerCapability = { auth: { getToken: () => Promise<string>; }; };

// `x?: T | undefined` lets a consumer with `exactOptionalPropertyTypes` pass the `undefined` the
// option checks treat as unset.
/* eslint-disable sonarjs/no-redundant-optional -- see above */
export type AuthBearerOptions = {
  /**
   * The header to set. Default `"Authorization"`. In a browser, `"Cookie"` rejects with
   * `ERR_BAD_OPTION_VALUE`, since fetch drops that header; use `withCredentials` there.
   */
  header?: string | undefined;
  /**
   * The origins (`"https://api.example.com"`) that get the token, replacing the default rule:
   * with an absolute instance `baseURL`, only its origin; otherwise only relative request URLs.
   */
  origins?: ReadonlyArray<string> | undefined;
  /** Replace a header the request already has. Default `false`: an explicit header is kept. */
  overwrite?: boolean | undefined;
  /** Put before the token, separated by a space. Default `"Bearer"`; `""` sends the bare token. */
  scheme?: string | undefined;
};
/* eslint-enable sonarjs/no-redundant-optional */

const optionsSchema = {
  overwrite: isBoolean,
  scheme: (value: unknown) => (typeof value === "string" && !/[\r\n]/.test(value)) || "a string without line breaks",
  header: isHeaderName,
  origins: isOriginList,
};

/**
 * Sets `Authorization: Bearer <token>` on requests to the API it guards, asking `getToken` each
 * time, and provides the `auth` capability so later plugins can ask for a token too. It is
 * `authenticate` with one header: the same origin rule, redirect and `redact` handling apply.
 * A header the request already has is kept, and `getToken` isn't called, unless `overwrite` is set.
 *
 * When `getToken` gives anything other than a non-empty string (`null`, `undefined`, `""`, a
 * number, an object), the request is sent without the header, so a signed-out state never sends
 * `Bearer null`. The parameter type stays `string`: the guard is for JavaScript callers and casts.
 */
export function authBearer(getToken: () => Promise<string> | string, options: AuthBearerOptions = {}): FaxiosPlugin<{ provides: AuthBearerCapability; }> {
  if (typeof getToken !== "function") {
    throw new FaxiosError("authBearer: getToken must be a function", FaxiosError.ERR_BAD_OPTION_VALUE);
  }
  assertOptions(options, optionsSchema, "authBearer");
  const overwrite = own(options, "overwrite") ?? false;
  const scheme = own(options, "scheme") ?? "Bearer";
  const header = own(options, "header") ?? "Authorization";
  const origins = originsOption(own(options, "origins"));
  const auth = { getToken: async () => getToken() };
  return definePlugin({
    name: "authBearer",
    provides: { auth },
    middleware: async (ctx, next) => {
      if ((!overwrite && ctx.config.headers.has(header)) || !goesToAPI(ctx.config, own(ctx, "instanceBaseURL"), origins)) return next(ctx);
      const token: unknown = await auth.getToken();
      if (typeof token !== "string" || token === "") return next(ctx);
      return next(putCredentials(ctx, [[ header, scheme ? `${scheme} ${token}` : token ]], overwrite));
    },
  });
}
