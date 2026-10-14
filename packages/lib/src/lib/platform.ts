"use strict";

const _globalThis = globalThis as {
  document?: unknown;
  FormData?: new () => object;
  self?: { importScripts?: unknown; };
  window?: { location?: { href?: string; }; };
  WorkerGlobalScope?: unknown;
};

const hasStandardBrowserEnv = typeof _globalThis.window !== "undefined" && typeof _globalThis.document !== "undefined";

const hasStandardBrowserWebWorkerEnv = (() => (
  typeof _globalThis.WorkerGlobalScope !== "undefined" &&
    _globalThis.self instanceof (_globalThis.WorkerGlobalScope as new (...args: Array<unknown>) => unknown) &&
    typeof _globalThis.self?.importScripts === "function"
))();

const origin = (hasStandardBrowserEnv && _globalThis.window?.location?.href) || "http://localhost";

export default {
  classes: {
    FormData: _globalThis.FormData !== undefined ? _globalThis.FormData : null,
  },
  hasStandardBrowserEnv,
  hasStandardBrowserWebWorkerEnv,
  origin,
};
