// @ts-self-types="./authBearer.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import type { FaxiosPlugin } from "../types.js";
import { definePlugin } from "./definePlugin.js";

/** What `authBearer` provides to plugins installed after it. */
export type AuthBearerCapability = { auth: { getToken: () => Promise<string>; }; };

/**
 * Sets `Authorization: Bearer <token>` on every request, asking `getToken` each time, and
 * provides the `auth` capability so later plugins (for example a token-refresh plugin) can ask
 * for a token too.
 */
export function authBearer(getToken: () => string | Promise<string>): FaxiosPlugin<{ provides: AuthBearerCapability; }> {
  const auth = { getToken: async () => getToken() };
  return definePlugin({
    name: "authBearer",
    provides: { auth },
    middleware: async (ctx, next) => {
      ctx.config.headers.set("Authorization", `Bearer ${await auth.getToken()}`);
      return next(ctx);
    },
  });
}
