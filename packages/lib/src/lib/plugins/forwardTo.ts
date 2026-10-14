// @ts-self-types="./forwardTo.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import { FaxiosError } from "../../index.js";
import type { FaxiosContext, FaxiosPlugin, FaxiosRequestConfig } from "../../index.js";
import { definePlugin } from "./definePlugin.js";
import { assertOptions, isHeaderName, own } from "./shared.js";

export type ForwardToOptions = {
  /** The header that carries the target URL. Default `"X-Forward-To"`. */
  header?: string;
};

/** `forward: false` sends that request straight to its own URL instead of the gateway. */
export type ForwardToRequestOptions = { forward?: false; };

type Fetch = NonNullable<NonNullable<FaxiosRequestConfig["env"]>["fetch"]>;

const optionsSchema = { header: isHeaderName };

// http or https only: `gateway.local:8888` parses as a URL whose scheme is `gateway.local:`.
function isHTTPURL(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  }
  catch {
    return false;
  }
}

// Sends what faxios would have sent to `gateway` instead, with the target URL in `header`. The
// adapter passes every init member (method, headers, signal, credentials, fetchOptions) with
// every call; with a Request input the body stays on the Request (`init.body` is undefined), so it is
// taken from there. Only the URL and that one header change.
function forwardingFetch(gateway: string, header: string, base: Fetch): Fetch {
  return async (input, init) => {
    // A Request has its URL in `url`; a string or URL is one. No `instanceof Request`: a runtime
    // may have no global Request (`env.Request: null`).
    const request = typeof input === "object" && "url" in input ? input : undefined;
    const target = request ? request.url : String(input);
    const headers = new Headers(init?.headers ?? request?.headers);
    headers.set(header, target);
    // Null prototype, like the adapter's own init: fetch reads every member through the prototype
    // chain, so a plain object would let a polluted Object.prototype.dispatcher apply.
    const forwarded: RequestInit = Object.assign(Object.create(null) as RequestInit, init, { headers });
    if (forwarded.body == null && request && request.method !== "GET" && request.method !== "HEAD") {
      // The adapter sets `duplex` only when the caller's body was a stream, so only then is it
      // streamed on. Any other body is resent as bytes, which keeps its Content-Length and works
      // where fetch can't send a stream (most browsers) or `Request.body` is null (Firefox).
      // `duplex` isn't in RequestInit's type yet.
      const isStreamBody = init !== undefined && "duplex" in init && init.duplex === "half" && request.body != null;
      Object.assign(forwarded, isStreamBody ? { body: request.body, duplex: "half" } : { body: await request.arrayBuffer() });
    }
    return base(gateway, forwarded);
  };
}

/**
 * Sends every request to a forwarding `gateway` (an absolute http or https URL) with the URL it
 * was going to in `X-Forward-To`, or the `header` option. The URL is the final one, with
 * `baseURL`, path params and validated `params` applied, because the plugin wraps the request's
 * `env.fetch` (or the global fetch) instead of rewriting `url`. Each try `retry` makes is
 * forwarded the same way, wherever `retry` is installed. Middleware still sees the target URL, so
 * `authBearer`'s origin rule checks the target, not the gateway. A request with `forward: false`
 * goes straight to its own URL.
 */
export function forwardTo(gateway: string, options: ForwardToOptions = {}): FaxiosPlugin<{ options: ForwardToRequestOptions; }> {
  if (!isHTTPURL(gateway)) {
    throw new FaxiosError("forwardTo: gateway must be an absolute http or https URL", FaxiosError.ERR_BAD_OPTION_VALUE);
  }
  assertOptions(options, optionsSchema, "forwardTo");
  const header = own(options, "header") ?? "X-Forward-To";
  return definePlugin({
    name: "forwardTo",
    options: { forward: true },
    middleware: async (ctx: FaxiosContext<ForwardToRequestOptions>, next) => {
      // Read as unknown: a JavaScript caller can pass anything, and only false is allowed.
      const forward: unknown = own(ctx.config, "forward");
      if (forward === false) return next(ctx);
      if (forward !== undefined) {
        throw new FaxiosError("option forward must be false", FaxiosError.ERR_BAD_OPTION_VALUE, ctx.config);
      }
      const env = own(ctx.config, "env");
      const base = (env ? own(env, "fetch") : undefined) ?? (typeof globalThis.fetch === "function" ? globalThis.fetch : undefined);
      // No fetch at all: let dispatch report it.
      if (!base) return next(ctx);
      // On a copy: middleware that calls next() again (retry installed before this plugin) comes
      // back through here with the unwrapped fetch, so a try is never forwarded twice. Both copies
      // keep a null prototype, like every ctx.config, so later middleware never reads inherited keys.
      const forwardEnv = Object.assign(Object.create(null) as NonNullable<typeof env>, env, { fetch: forwardingFetch(gateway, header, base) });
      const config = Object.assign(Object.create(null) as typeof ctx.config, ctx.config, { env: forwardEnv });
      return next({ ...ctx, config });
    },
  });
}
