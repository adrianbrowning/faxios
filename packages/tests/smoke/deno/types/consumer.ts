// Checked by `deno check types/` at the start of `deno task test`, never run. Deno takes the
// types of a built `.js` module only from its `@ts-self-types` pragma and otherwise infers them
// from the JS, which turns these exports into `any` or loose JS shapes. The assertions below
// fail `deno check` when the pragma on one of these modules is missing.
import faxios, {
  assertSignal,
  CanceledError,
  canceledFromSignal,
  FaxiosError,
  hasOwnInPrototypeChain,
  isCancel,
  isFaxiosError,
  mergeConfig,
  onAbort,
  raceAbort,
  toFormData,
  VERSION
} from "faxios";
import type { AbortableSignal, InternalFaxiosRequestConfig } from "faxios";
import buildFullPath from "faxios/unsafe/core/buildFullPath.js";
import buildURL from "faxios/unsafe/helpers/buildURL.js";
import combineURLs from "faxios/unsafe/helpers/combineURLs.js";
import isAbsoluteURL from "faxios/unsafe/helpers/isAbsoluteURL.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type IsAny<T> = 0 extends 1 & T ? true : false;
function expectType<T extends true>(_: T): void {}

// The documented narrowing: inside the guard `error` is a FaxiosError, not `unknown` or `any`.
export function handle(error: unknown): string | undefined {
  if (faxios.isFaxiosError(error)) {
    expectType<Equal<typeof error, FaxiosError<unknown, unknown>>>(true);
    return error.code;
  }
  if (isFaxiosError<{ message: string; }>(error)) {
    const message: string | undefined = error.response?.data.message;
    return message;
  }
  if (isCancel(error)) {
    expectType<Equal<typeof error, CanceledError>>(true);
    return error.message;
  }
  return undefined;
}

expectType<Equal<typeof faxios.isCancel, typeof isCancel>>(true);
expectType<Equal<typeof faxios.mergeConfig, typeof mergeConfig>>(true);
const merged = mergeConfig({ timeout: 1 });
expectType<Equal<IsAny<typeof mergeConfig>, false>>(true);
expectType<Equal<typeof merged.timeout, number | undefined>>(true);
expectType<Equal<IsAny<typeof toFormData>, false>>(true);
expectType<Equal<IsAny<typeof VERSION>, false>>(true);
export const version: string = VERSION;

expectType<Equal<typeof combineURLs, (baseURL: string, relativeURL?: string) => string>>(true);
expectType<Equal<typeof isAbsoluteURL, (url: unknown) => boolean>>(true);
expectType<Equal<typeof buildURL, (url: string, params?: unknown, options?: unknown) => string>>(true);
expectType<Equal<typeof buildFullPath, (baseURL: string | undefined, requestedURL: string | undefined, allowAbsoluteUrls?: unknown, config?: unknown) => string | undefined>>(true);

// Root exports re-exported from their own modules: each needs its own pragma.
expectType<Equal<IsAny<typeof canceledFromSignal>, false>>(true);
expectType<Equal<IsAny<typeof assertSignal>, false>>(true);
expectType<Equal<IsAny<typeof raceAbort>, false>>(true);
expectType<Equal<IsAny<typeof onAbort>, false>>(true);
expectType<Equal<IsAny<typeof hasOwnInPrototypeChain>, false>>(true);
expectType<Equal<IsAny<AbortableSignal>, false>>(true);
expectType<Equal<typeof canceledFromSignal, (signal: { readonly aborted: boolean; reason?: unknown; }, config?: InternalFaxiosRequestConfig, request?: unknown) => FaxiosError>>(true);
expectType<Equal<typeof assertSignal, (signal: unknown, config: InternalFaxiosRequestConfig) => void>>(true);
expectType<Equal<typeof raceAbort, <T>(signal: AbortableSignal, run: () => PromiseLike<T> | T, abortError: () => unknown) => Promise<T>>>(true);
expectType<Equal<typeof onAbort, (signal: AbortableSignal, listener: () => void) => () => void>>(true);
expectType<Equal<typeof hasOwnInPrototypeChain, (thing: unknown, prop: PropertyKey) => boolean>>(true);
expectType<Equal<AbortableSignal, {
  readonly aborted: boolean;
  addEventListener: (type: "abort", listener: () => void) => unknown;
  removeEventListener: (type: "abort", listener: () => void) => unknown;
}>>(true);
