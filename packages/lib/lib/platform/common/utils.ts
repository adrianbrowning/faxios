const _globalThis = globalThis as {
  window?: { location?: { href?: string; }; };
  document?: unknown;
  navigator?: { product?: string; userAgent?: string; };
  WorkerGlobalScope?: unknown;
  self?: { importScripts?: unknown; };
};

const hasBrowserEnv = typeof _globalThis.window !== "undefined" && typeof _globalThis.document !== "undefined";

const _navigator = typeof _globalThis.navigator === "object" ? _globalThis.navigator : undefined;

/**
 * Determine if we're running in a standard browser environment
 *
 * This allows axios to run in a web worker, and react-native.
 * Both environments support XMLHttpRequest, but not fully standard globals.
 *
 * web workers:
 *  typeof window -> undefined
 *  typeof document -> undefined
 *
 * react-native:
 *  navigator.product -> 'ReactNative'
 * nativescript
 *  navigator.product -> 'NativeScript' or 'NS'
 *
 * @returns {boolean}
 */
const hasStandardBrowserEnv =
  hasBrowserEnv &&
  (!_navigator || [ "ReactNative", "NativeScript", "NS" ].indexOf(_navigator.product ?? "") < 0);

/**
 * Determine if we're running in a standard browser webWorker environment
 *
 * Although the `isStandardBrowserEnv` method indicates that
 * `allows axios to run in a web worker`, the WebWorker will still be
 * filtered out due to its judgment standard
 * `typeof window !== 'undefined' && typeof document !== 'undefined'`.
 * This leads to a problem when axios post `FormData` in webWorker
 */
const hasStandardBrowserWebWorkerEnv = (() => (
  typeof _globalThis.WorkerGlobalScope !== "undefined" &&
    _globalThis.self instanceof (_globalThis.WorkerGlobalScope as new (...args: Array<unknown>) => unknown) &&
    typeof _globalThis.self?.importScripts === "function"
))();

const origin = (hasBrowserEnv && _globalThis.window?.location?.href) || "http://localhost";

export {
  hasBrowserEnv,
  hasStandardBrowserWebWorkerEnv,
  hasStandardBrowserEnv,
  _navigator as navigator,
  origin
};
