// @ts-self-types="./definePlugin.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import type { FaxiosMiddleware, FaxiosPlugin } from "../types.js";

// An empty capability or option map adds nothing, so it's the `unknown` an absent slot is.
type Slot<T> = [keyof T] extends [never] ? unknown : T;

// The middleware's capabilities are what it requires plus what it provides itself.
type RequiredCapabilities<TCapabilities, TProvides> = [keyof TProvides] extends [never]
  ? Slot<TCapabilities>
  : Slot<{ [K in keyof TCapabilities as K extends keyof TProvides ? never : K]: TCapabilities[K]; }>;

/**
 * Builds a plugin for `use()` and infers its `FaxiosPlugin` slots from the object: `provides` from
 * the `provides` value, `options` and `requires` from the context type the middleware annotates
 * (`ctx: FaxiosContext<Options, Capabilities>`). Capabilities the plugin provides itself don't
 * count as required. Returns the same object.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}`: no capabilities or options, as in FaxiosContext
export function definePlugin<TProvides = {}, TOptions = {}, TCapabilities = TProvides>(plugin: {
  name: string;
  // The middleware reads the capabilities it provides from ctx too, so they must have the types
  // its context declares. NoInfer: TProvides is inferred from the value alone.
  provides?: TProvides & NoInfer<Pick<TCapabilities, keyof TProvides & keyof TCapabilities>>;
  middleware: FaxiosMiddleware<TOptions, TCapabilities>;
}): FaxiosPlugin<{
  requires: RequiredCapabilities<TCapabilities, TProvides>;
  provides: Slot<TProvides>;
  options: Slot<TOptions>;
}> {
  // Only the types change: use() reads the fields at install time, as it does for any plugin.
  return plugin as never;
}
