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
   * The origins (`"https://api.example.com"`) whose requests wait for a running refresh and whose
   * responses can trigger one, replacing the default rule: with an absolute instance `baseURL`,
   * only its origin; otherwise only relative request URLs. Use the same list as `authenticate` or
   * `authBearer`.
   */
  origins?: ReadonlyArray<string> | undefined;
  /**
   * Whether a failed request should refresh and be sent again. Replaces the `statuses` check;
   * the origin rule and the other conditions still apply. An error without a response (a network
   * error) skips the check that the response came from the API, since there is none.
   */
  refreshOn?: ((error: FaxiosError) => boolean) | undefined;
  /** Response statuses that refresh. Default `[401]`. Ignored when `refreshOn` is set. */
  statuses?: ReadonlyArray<number> | undefined;
};

/**
 * `refreshAuth: false` sends that request once, without waiting for a refresh or starting one. The
 * refresh call needs it when it goes through the same instance.
 */
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
 * refresh tokens are spent once. A request to the API that starts while a refresh runs waits for
 * it, then is sent once with the new credentials; if the refresh rejects, the request rejects with
 * its error and isn't sent. A request that was sent before the latest refresh finished is sent
 * again without another refresh: it failed with the credentials that refresh replaced. A rejected
 * `refresh` rejects every request waiting on it with its error. Any method is sent again; a stream
 * body, which the first try used up, isn't, and nor is a request whose signal aborted. Aborting
 * while the refresh runs rejects that request at once, with `CanceledError`; the refresh goes on
 * for the others.
 *
 * The refresh call must set `refreshAuth: false` when it goes through this instance, or use
 * another instance. Otherwise it waits for the refresh it is part of: it rejects with `ETIMEDOUT`
 * at its `timeout`, or never settles without one.
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
  // Stored before `refresh` runs, a tick later, so a request it sends through this instance
  // without `refreshAuth: false` waits for it like any other, and a synchronous throw clears it.
  const sharedRefresh = (failure: FaxiosError): Promise<void> => {
    running ??= Promise.resolve(failure).then(run)
      .finally(() => {
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
  // Whether the request went to the API and the response came from it.
  const fromAPI = (failure: FaxiosError, ctx: FaxiosContext<RefreshAuthRequestOptions>): boolean =>
    goesToAPI(ctx.config, own(ctx, "instanceBaseURL"), origins) && answeredByAPI(failure);
  // Whether a failed request triggers a refresh: on the refresh statuses (or refreshOn), from the
  // API, with a body that can be sent again. The status check runs before the origin rule, which
  // parses URLs; refreshOn, a caller's function, only runs for the API.
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
  // A request to the API waits for the running refresh, so it is sent once, with the new
  // credentials. If the refresh rejects, so does the request, before it is sent.
  const pause = async (paused: Promise<void>, ctx: FaxiosContext<RefreshAuthRequestOptions>): Promise<void> => {
    const config = ctx.config;
    if (!goesToAPI(config, own(ctx, "instanceBaseURL"), origins)) return;
    const signal = own(config, "signal");
    if (!signal) return paused;
    // Listened on here, so check it as retry does.
    assertSignal(signal, config);
    return raceAbort(signal, () => paused, () => canceledFromSignal(signal, config));
  };
  return definePlugin({
    name: "refreshAuth",
    options: { refreshAuth: true },
    middleware: async (ctx: FaxiosContext<RefreshAuthRequestOptions>, next) => {
      const config = ctx.config;
      const optOut: unknown = own(config, "refreshAuth");
      if (optOut === false) return next(ctx);
      if (optOut !== undefined) {
        throw new FaxiosError("option refreshAuth must be false", FaxiosError.ERR_BAD_OPTION_VALUE, config);
      }
      // Only while a refresh runs, so other requests reach the adapter in the same tick.
      if (running) await pause(running, ctx);
      const signal = own(config, "signal");
      // Taken after the wait: the request gets the credentials of the refresh it waited for, so a
      // 401 on it refreshes again.
      const finishedBefore = finished;
      try {
        return await next(ctx);
      }
      catch (error) {
        // Read and listened on below.
        if (signal) assertSignal(signal, config);
        if (!(error instanceof FaxiosError) || signal?.aborted || !triggers(error, ctx)) throw error;
        discardBody(error);
        // Join the running refresh, or start one. Skip it only when a refresh finished since this
        // request was sent: the request failed with the credentials that refresh replaced, so it
        // only needs sending again.
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
