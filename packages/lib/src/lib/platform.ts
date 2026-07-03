"use strict";

import FaxiosURLSearchParams from "./helpers/FaxiosURLSearchParams.js";

const _globalThis = globalThis as {
  window?: { location?: { href?: string; }; };
  document?: unknown;
  navigator?: { product?: string; userAgent?: string; };
  WorkerGlobalScope?: unknown;
  self?: { importScripts?: unknown; };
  FormData?: new (...args: Array<unknown>) => object;
  Blob?: new (...args: Array<unknown>) => object;
};

const hasBrowserEnv = typeof _globalThis.window !== "undefined" && typeof _globalThis.document !== "undefined";

const _navigator = typeof _globalThis.navigator === "object" ? _globalThis.navigator : undefined;

const hasStandardBrowserEnv =
  hasBrowserEnv &&
  (!_navigator || [ "ReactNative", "NativeScript", "NS" ].indexOf(_navigator.product ?? "") < 0);

const hasStandardBrowserWebWorkerEnv = (() => (
  typeof _globalThis.WorkerGlobalScope !== "undefined" &&
    _globalThis.self instanceof (_globalThis.WorkerGlobalScope as new (...args: Array<unknown>) => unknown) &&
    typeof _globalThis.self?.importScripts === "function"
))();

const origin = (hasBrowserEnv && _globalThis.window?.location?.href) || "http://localhost";

export default {
  isBrowser: true,
  classes: {
    URLSearchParams: typeof URLSearchParams !== "undefined" ? URLSearchParams : FaxiosURLSearchParams,
    FormData: _globalThis.FormData !== undefined ? _globalThis.FormData : null,
    Blob: _globalThis.Blob !== undefined ? _globalThis.Blob : null,
  },
  protocols: [ "http", "https", "file", "blob", "url", "data" ],
  hasBrowserEnv,
  hasStandardBrowserEnv,
  hasStandardBrowserWebWorkerEnv,
  navigator: _navigator,
  origin,
};
