// @ts-self-types="./refreshAuth.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import type { FaxiosContext, FaxiosPlugin, InternalFaxiosRequestConfig } from "../../index.js";
import canceledFromSignal from "../cancel/canceledFromSignal.js";
import assertSignal from "../core/assertSignal.js";
import FaxiosError from "../core/FaxiosError.js";
import raceAbort from "../helpers/raceAbort.js";
import { goesToAPI, isOriginList, originsOption } from "./credentials.js";
import { definePlugin } from "./definePlugin.js";
import { assertOptions, canReplay, discardBody, isFunction, isStatusList, own } from "./shared.js";

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
  shouldRefresh?: ((error: FaxiosError) => boolean) | undefined;
  /** Response statuses that refresh. Default `[401]`. Ignored when `shouldRefresh` is set. */
  statuses?: Array<number> | undefined;
};

/** `refreshAuth: false` sends that request once, without refreshing, such as the refresh call itself. */
export type RefreshAuthRequestOptions = { refreshAuth?: false | undefined; };
/* eslint-enable sonarjs/no-redundant-optional */

const optionsSchema = { origins: isOriginList, shouldRefresh: isFunction, statuses: isStatusList };

const DEFAULT_STATUSES: ReadonlyArray<number> = [ 401 ];

/**
 * Refreshes credentials once when a request to the API fails with a 401 (or `statuses`, or
 * `shouldRefresh`), then sends the request again, once. Install it before `authenticate` or
 * `authBearer`, which put the refreshed credentials on the second try; it never sets any itself.
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
export function refreshAuth(refresh: (error: FaxiosError) => Promise<void> | void, options: RefreshAuthOptions = {}): FaxiosPlugin<{ options: RefreshAuthRequestOptions; }> {
  if (typeof refresh !== "function") {
    throw new FaxiosError("refreshAuth: refresh must be a function", FaxiosError.ERR_BAD_OPTION_VALUE);
  }
  assertOptions(options, optionsSchema, "refreshAuth");
  const origins = originsOption(own(options, "origins"));
  const shouldRefresh = own(options, "shouldRefresh");
  const statuses = own(options, "statuses") ?? DEFAULT_STATUSES;
  // One refresh at a time, and how many have finished: a request sent before the count moved
  // failed with credentials that are already replaced.
  let refreshing: Promise<void> | undefined;
  let refreshed = 0;
  const refreshOnce = (error: FaxiosError): Promise<void> => {
    refreshing ??= (async () => {
      try {
        await refresh(error);
        refreshed++;
      }
      finally {
        refreshing = undefined;
      }
    })();
    return refreshing;
  };
  // Whether a failed request refreshes: a FaxiosError on the refresh statuses (or shouldRefresh),
  // from the API, with a body that can be sent again and a signal that hasn't aborted.
  const refreshes = (error: unknown, ctx: FaxiosContext<RefreshAuthRequestOptions>): error is FaxiosError =>
    error instanceof FaxiosError
    && !own(ctx.config, "signal")?.aborted
    && canReplay(own(ctx.config, "data"))
    && goesToAPI(ctx.config, own(ctx, "instanceBaseURL"), origins)
    && (shouldRefresh ? shouldRefresh(error) : statuses.includes(error.response?.status ?? 0));
  // The refresh to wait for, raced against the signal so an abort rejects at once.
  const waitForRefresh = (error: FaxiosError, config: InternalFaxiosRequestConfig): Promise<void> => {
    const signal = own(config, "signal");
    return signal ? raceAbort(signal, () => refreshOnce(error), () => canceledFromSignal(signal, config)) : refreshOnce(error);
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
      const sentAfter = refreshed;
      try {
        return await next(ctx);
      }
      catch (error) {
        const config = ctx.config;
        const signal = own(config, "signal");
        // Read and listened on below, so check it as retry does.
        if (signal) assertSignal(signal, config);
        if (!refreshes(error, ctx)) throw error;
        discardBody(error);
        // A refresh finished since this request was sent: it failed with replaced credentials, so
        // it only needs sending again.
        if (refreshing || refreshed === sentAfter) await waitForRefresh(error, config);
        // An abort that landed after the refresh settled rejects here, before the second try.
        if (signal?.aborted) throw canceledFromSignal(signal, config);
        return next(ctx);
      }
    },
  });
}
