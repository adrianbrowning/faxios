// @ts-self-types="./index.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/
/* eslint-disable no-barrel-files/no-barrel-files -- the @gcmdev/faxios/plugins entry point */
export { authBearer } from "./authBearer.ts";
export type { AuthBearerCapability } from "./authBearer.ts";
export { retry } from "./retry.ts";
export type { RetryOptions, RetryRequestOptions } from "./retry.ts";
export { timing } from "./timing.ts";
export type { TimingEvent } from "./timing.ts";
