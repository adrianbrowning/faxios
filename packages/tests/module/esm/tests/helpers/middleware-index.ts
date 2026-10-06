// Type-checked fixture (NO @ts-nocheck) guarding the packaged middleware API:
// - use() chains on create() instances and accumulates plugin options and capabilities
// - ctx and next are typed for inline middleware
// - plugin options are rejected without their plugin
// - a plugin that needs a capability can't be installed before its provider
// - static helpers exist only on the default export
// - definePlugin comes from faxios/plugins, each built-in from its own subpath, nothing from the root
// - definePlugin infers a plugin's slots, and the Faxios class has no use()
// - the internal plugin helper types aren't importable from the package root
import faxios, { Faxios, FaxiosHeaders } from "faxios";
// @ts-expect-error - the built-in plugins aren't root exports
import { retry as rootRetry } from "faxios";
// @ts-expect-error - definePlugin lives on faxios/plugins, not the root
import { definePlugin as rootDefinePlugin } from "faxios";
import type { FaxiosContext, FaxiosInstance, FaxiosMiddleware, FaxiosPlugin, FaxiosResponse } from "faxios";
import { definePlugin } from "faxios/plugins";
// @ts-expect-error - faxios/plugins doesn't re-export the built-ins
import { retry as pluginsEntryRetry } from "faxios/plugins";
import { authBearer } from "faxios/plugins/auth-bearer";
import type { AuthBearerCapability } from "faxios/plugins/auth-bearer";
import { retry } from "faxios/plugins/retry";
import type { RetryRequestOptions } from "faxios/plugins/retry";
import { timing } from "faxios/plugins/timing";
import type { TimingEvent } from "faxios/plugins/timing";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

const addHeader: FaxiosMiddleware = async (ctx, next) => {
  const context: FaxiosContext = ctx;
  context.config.headers.set("X-Trace", "1");
  const response: FaxiosResponse = await next(ctx);
  return response;
};

// Header accessors and assignments a middleware commonly uses on ctx.config.headers.
const assignHeaders: FaxiosMiddleware = async (ctx, next) => {
  const { config } = ctx;
  config.headers.Accept = "foo";
  config.headers.setAccept("foo");
  config.headers.set("bar", "2");
  config.headers.set({ myHeader: "myValue" });
  config.headers = new FaxiosHeaders({ myHeader: "myValue" });
  config.headers.set("after", "assignment");
  return next(ctx);
};

const refreshOn401 = definePlugin({
  name: "refreshOn401",
  middleware: async (ctx: FaxiosContext<unknown, AuthBearerCapability>, next) => {
    const token: string = await ctx.capabilities.auth.getToken();
    ctx.config.headers.set("Authorization", `Bearer ${token}`);
    return next(ctx);
  },
});
const refreshType: Equal<typeof refreshOn401, FaxiosPlugin<{ requires: AuthBearerCapability; }>> = true;
const defaultRetry = retry();
const retryType: Equal<typeof defaultRetry, FaxiosPlugin<{ options: RetryRequestOptions; }>> = true;
void refreshType;
void retryType;
void rootDefinePlugin;
void pluginsEntryRetry;

async function middleware(): Promise<void> {
  const api = faxios.create({ baseURL: "https://example.test" })
    .use(addHeader)
    .use(authBearer(() => "token"))
    .use(refreshOn401)
    .use(retry({ attempts: 2, methods: [ "get", "post" ] }))
    .use(timing(({ durationMs }: TimingEvent) => void durationMs));

  await api.get("/items", { retry: false });
  await api.post("/items", {}, { retry: { attempts: 3 } });
  api.eject(addHeader);
  faxios.create().use(assignHeaders);
  const child = faxios.create();
  const created: Equal<typeof child, FaxiosInstance> = true;
  void created;

  // @ts-expect-error - retry options need the retry plugin
  await faxios.create().get("/items", { retry: false });

  // @ts-expect-error - refreshOn401 requires the auth capability authBearer provides
  faxios.create().use(refreshOn401);

  // @ts-expect-error - static helpers exist only on the default export
  void faxios.create().mergeConfig;

  // @ts-expect-error - the built-in plugins moved to faxios/plugins
  void faxios.plugins;

  // @ts-expect-error - use() is typed only on the instance create() returns
  new Faxios().use(addHeader);
}

void rootRetry;

// @ts-expect-error - internal: use() infers through it, users write FaxiosPlugin
export type RootPluginBase = import("faxios").FaxiosPluginBase;
// @ts-expect-error - internal: use() infers through it, users write FaxiosPlugin
export type RootPluginArgument = import("faxios").FaxiosPluginArgument;

void middleware;
