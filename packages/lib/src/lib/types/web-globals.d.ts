// Build-time declarations of the web-platform globals faxios calls at runtime, typed with the
// minimal shims in `web.ts`. The lib compiles with `lib: ["ES2023"]` and no `@types/*`, so a DOM
// or Node global missing here is a compile error. tsconfig.json loads this file through `types`;
// tsc never emits `.d.ts` inputs, so none of it reaches the published declarations, which name
// the `Web*` types from `web.ts` instead. Only values are declared: a global name used as a type
// fails, so public signatures must use the `Web*` types.
import type { BuildGlobalsShim } from "./web.js";

declare global {
  var AbortController: BuildGlobalsShim["AbortController"];
  var AbortSignal: BuildGlobalsShim["AbortSignal"];
  var Blob: BuildGlobalsShim["Blob"];
  var FormData: BuildGlobalsShim["FormData"];
  var Headers: BuildGlobalsShim["Headers"];
  var performance: BuildGlobalsShim["performance"];
  var ReadableStream: BuildGlobalsShim["ReadableStream"];
  var Request: BuildGlobalsShim["Request"];
  var Response: BuildGlobalsShim["Response"];
  var TextEncoder: BuildGlobalsShim["TextEncoder"];
  var URL: BuildGlobalsShim["URL"];
  var URLSearchParams: BuildGlobalsShim["URLSearchParams"];
  var clearTimeout: BuildGlobalsShim["clearTimeout"];
  var fetch: BuildGlobalsShim["fetch"];
  var queueMicrotask: BuildGlobalsShim["queueMicrotask"];
  var setTimeout: BuildGlobalsShim["setTimeout"];
}
