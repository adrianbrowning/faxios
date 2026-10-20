// @ts-self-types="./refreshAuth.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import type { FaxiosContext, FaxiosPlugin } from "../../index.js";
import canceledFromSignal from "../cancel/canceledFromSignal.js";
import assertSignal from "../core/assertSignal.js";
import FaxiosError from "../core/FaxiosError.js";
import raceAbort from "../helpers/raceAbort.js";
import { goesToAPI, isOriginList, originsOption } from "./credentials.js";
import { definePlugin } from "./definePlugin.js";
import { assertOptions, canReplay, discardBody, isFunction, isStatusList, own } from "./shared.js";

const originOf = (url: string): null | string => {
  try {
    return new URL(url).origin;
  }
  catch {
    return null;
  }
};

// `x?: T | undefined` lets a consumer with `exactOptionalPropertyTypes` pass the `undefined` the
// option checks treat as unset.
/* eslint-disable sonarjs/no-redundant-optional -- see above */
export type RefreshAuthOptions = {
  /**
   * The origins (`"https://api.example.com"`) whose responses can trigger a refresh, replacing the
   * default rule: with an absolute instance `baseURL`, only its origin; otherwise only relative
   * request URLs. Use the same list as `authenticate` or `authBearer`.
   */
  origins?: Array<string> | undefined;
  /**
   * Whether a failed request should refresh and be sent again. Replaces the `statuses` check;
   * the origin rule and the other conditions still apply.
   */
  refreshOn?: ((error: FaxiosError) => boolean) | undefined;
  /** Response statuses that refresh. Default `[401]`. Ignored when `refreshOn` is set. */
  statuses?: Array<number> | undefined;
};

/** `refreshAuth: false` sends that request once, without refreshing, such as the refresh call itself. */
export type RefreshAuthRequestOptions = { refreshAuth?: false | undefined; };
/* eslint-enable sonarjs/no-redundant-optional */

const optionsSchema = { origins: isOriginList, refreshOn: isFunction, statuses: isStatusList };

const DEFAULT_STATUSES: ReadonlyArray<number> = [ 401 ];

/**
 * Refreshes credentials once when a request to the API fails with a 401 (or `statuses`, or
 * `refreshOn`), then sends the request again, once. Install it before `authenticate` or
 * `authBearer`, which put the refreshed credentials on the second try; it never sets any itself.
 * `refresh` can return anything; faxios only waits for it.
 *
 * Concurrent failures share one call to `refresh`, which gets the first one's error, so rotating
 * refresh tokens are spent once. A request that was sent before the latest refresh finished is
 * sent again without another refresh: it failed with the credentials that refresh replaced.
 * A rejected `refresh` rejects every request waiting on it with its error. Any method is sent
 * again, since the server refused it; a stream body, which the first try used up, isn't, and nor
 * is a request whose signal aborted. Aborting while the refresh runs rejects that request at once,
 * with `CanceledError`; the refresh goes on for the others.
 *
 * Pass `refreshAuth: false` on the refresh call when it goes through this instance, or make it
 * with another instance: a 401 on it would otherwise wait for the refresh it is part of.
 */
export function refreshAuth(refresh: (error: FaxiosError) => unknown, options: RefreshAuthOptions = {}): FaxiosPlugin<{ options: RefreshAuthRequestOptions; }> {
  if (typeof refresh !== "function") {
    throw new FaxiosError("refreshAuth: refresh must be a function", FaxiosError.ERR_BAD_OPTION_VALUE);
  }
  assertOptions(options, optionsSchema, "refreshAuth");
  const origins = originsOption(own(options, "origins"));
  const refreshOn = own(options, "refreshOn");
  const statuses = own(options, "statuses") ?? DEFAULT_STATUSES;
  // The refresh running, if any, and how many have finished: a request sent before the count
  // moved failed with credentials that are already replaced.
  let running: Promise<void> | undefined;
  let finished = 0;
  const run = async (failure: FaxiosError): Promise<void> => {
    await refresh(failure);
    finished++;
  };
  // Cleared once the promise is stored, so a refresh that throws synchronously is cleared too.
  const sharedRefresh = (failure: FaxiosError): Promise<void> => {
    running ??= run(failure).finally(() => {
      running = undefined;
    });
    return running;
  };
  // Whether a redirected response came from the origin the request was sent to, or one in
  // `origins`. A 401 from a host the API redirected to isn't the API refusing the credentials, so
  // a refresh wouldn't help it. A response fetch doesn't call redirected (a custom fetch, a
  // hand-built Response) counts as the API's.
  const answeredByAPI = (failure: FaxiosError): boolean => {
    const response = failure.response;
    if (response?.redirected !== true) return true;
    const finalURL = response.url;
    const sentURL = response.request?.url;
    if (finalURL === undefined) return false;
    const finalOrigin = originOf(finalURL);
    if (finalOrigin === null) return false;
    if (origins?.includes(finalOrigin)) return true;
    return sentURL !== undefined && originOf(sentURL) === finalOrigin;
  };
  // Whether a failed request triggers a refresh: on the refresh statuses (or refreshOn), from the
  // API, with a body that can be sent again. The status check runs before the origin rule, which
  // parses URLs; refreshOn, a caller's function, only runs for the API.
  const fromAPI = (failure: FaxiosError, ctx: FaxiosContext<RefreshAuthRequestOptions>): boolean =>
    goesToAPI(ctx.config, own(ctx, "instanceBaseURL"), origins) && answeredByAPI(failure);
  const triggers = (failure: FaxiosError, ctx: FaxiosContext<RefreshAuthRequestOptions>): boolean => {
    if (!canReplay(own(ctx.config, "data"))) return false;
    if (!refreshOn) return statuses.includes(failure.response?.status ?? 0) && fromAPI(failure, ctx);
    if (!fromAPI(failure, ctx)) return false;
    try {
      return refreshOn(failure);
    }
    catch (reason) {
      // Its error replaces the request's, so free the body the request's holds.
      discardBody(failure);
      throw reason;
    }
  };
  return definePlugin({
    name: "refreshAuth",
    options: { refreshAuth: true },
    middleware: async (ctx: FaxiosContext<RefreshAuthRequestOptions>, next) => {
      const optOut: unknown = own(ctx.config, "refreshAuth");
      if (optOut === false) return next(ctx);
      if (optOut !== undefined) {
        throw new FaxiosError("option refreshAuth must be false", FaxiosError.ERR_BAD_OPTION_VALUE, ctx.config);
      }
      const finishedBefore = finished;
      try {
        return await next(ctx);
      }
      catch (error) {
        const config = ctx.config;
        const signal = own(config, "signal");
        // Read and listened on below, so check it as retry does.
        if (signal) assertSignal(signal, config);
        if (!(error instanceof FaxiosError) || signal?.aborted || !triggers(error, ctx)) throw error;
        discardBody(error);
        // A refresh finished since this request was sent: it failed with replaced credentials, so
        // it only needs sending again.
        if (running || finished === finishedBefore) {
          await (signal ? raceAbort(signal, () => sharedRefresh(error), () => canceledFromSignal(signal, config)) : sharedRefresh(error));
        }
        // An abort that landed after the refresh settled rejects here, before the second try.
        if (signal?.aborted) throw canceledFromSignal(signal, config);
        return next(ctx);
      }
    },
  });
}
