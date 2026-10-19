// Type-checked fixture (NO @ts-nocheck) guarding the packaged middleware API:
// - use() chains on create() instances and accumulates plugin options and capabilities
// - ctx and next are typed for inline middleware, including the ctx.attempt try number
// - plugin options are rejected without their plugin
// - a plugin that needs a capability can't be installed before its provider
// - static helpers exist only on the default export
// - definePlugin comes from faxios/plugins, each built-in from its own subpath, nothing from the root
// - definePlugin infers a plugin's slots, and the Faxios class has no use()
// - the internal plugin helper types aren't importable from the package root
import faxios, { Faxios, FaxiosHeaders } from "faxios";
// @ts-expect-error TS2614 -- the built-in plugins aren't root exports
import { retry as rootRetry } from "faxios";
// @ts-expect-error TS2614 -- definePlugin lives on faxios/plugins, not the root
import { definePlugin as rootDefinePlugin } from "faxios";
import type { FaxiosContext, FaxiosInstance, FaxiosMiddleware, FaxiosPlugin, FaxiosResponse } from "faxios";
import { definePlugin } from "faxios/plugins";
// @ts-expect-error TS2305 -- faxios/plugins doesn't re-export the built-ins
import { retry as pluginsEntryRetry } from "faxios/plugins";
import { authBearer } from "faxios/plugins/auth-bearer";
import type { AuthBearerCapability } from "faxios/plugins/auth-bearer";
import { authenticate } from "faxios/plugins/authenticate";
import type { AuthenticateCredentials, AuthenticateCredentialValues } from "faxios/plugins/authenticate";
import { forwardTo } from "faxios/plugins/forward-to";
import type { ForwardToRequestOptions } from "faxios/plugins/forward-to";
import { refreshAuth } from "faxios/plugins/refresh-auth";
import type { RefreshAuthRequestOptions } from "faxios/plugins/refresh-auth";
import { retry } from "faxios/plugins/retry";
import type { RetryRequestOptions } from "faxios/plugins/retry";
import { timing } from "faxios/plugins/timing";
import type { TimingEvent } from "faxios/plugins/timing";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

const addHeader: FaxiosMiddleware = async (ctx, next) => {
  const context: FaxiosContext = ctx;
  context.config.headers.set("X-Trace", "1");
  context.attempt = context.attempt + 1;
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
const defaultForwardTo = forwardTo("http://gateway.test/");
const forwardToType: Equal<typeof defaultForwardTo, FaxiosPlugin<{ options: ForwardToRequestOptions; }>> = true;
void refreshType;
void retryType;
void forwardToType;
void rootDefinePlugin;
void pluginsEntryRetry;
const legacyCredentials = async (): Promise<AuthenticateCredentials> => ({ query: { api_key: "k" }, cookies: { session: null } });
const defaultAuthenticate = authenticate(legacyCredentials, { origins: [ "https://example.test" ], overwrite: true });
const authenticateType: Equal<typeof defaultAuthenticate, FaxiosPlugin> = true;
void authenticateType;
// An `as const` origins list is a readonly tuple.
const apiOrigins = [ "https://example.test" ] as const;
const storeValues: AuthenticateCredentialValues = { api_key: "k" };
const readonlyOrigins = authenticate(() => ({ query: storeValues }), { origins: apiOrigins });
const readonlyOriginsType: Equal<typeof readonlyOrigins, FaxiosPlugin> = true;
void readonlyOriginsType;
const defaultRefreshAuth = refreshAuth(async () => {}, { statuses: [ 401, 403 ] });
const refreshAuthType: Equal<typeof defaultRefreshAuth, FaxiosPlugin<{ options: RefreshAuthRequestOptions; }>> = true;
void refreshAuthType;

async function middleware(): Promise<void> {
  const api = faxios.create({ baseURL: "https://example.test" })
    .use(addHeader)
    .use(refreshAuth(() => {}))
    .use(authBearer(() => "token"))
    .use(authenticate(() => ({ headers: { "X-Api-Key": "k" } })))
    .use(refreshOn401)
    .use(retry({ attempts: 2, methods: [ "get", "post" ] }))
    .use(timing(({ attempt, durationMs }: TimingEvent) => void (durationMs + attempt)))
    .use(forwardTo("http://gateway.test/", { header: "X-Forward-To" }));

  await api.get("/items", { retry: false });
  await api.post("/items", {}, { retry: { attempts: 3 } });
  await api.get("/health", { forward: false });
  await api.post("/auth/refresh", null, { refreshAuth: false });
  api.eject(addHeader);
  faxios.create().use(assignHeaders);
  const child = faxios.create();
  const created: Equal<typeof child, FaxiosInstance> = true;
  void created;

  // @ts-expect-error TS2769 -- retry options need the retry plugin
  await faxios.create().get("/items", { retry: false });

  // @ts-expect-error TS2769 -- refreshAuth: false needs the refreshAuth plugin
  await faxios.create().get("/items", { refreshAuth: false });

  // @ts-expect-error TS2769 -- forward needs the forwardTo plugin
  await faxios.create().get("/items", { forward: false });

  // @ts-expect-error TS2345 -- refreshOn401 requires the auth capability authBearer provides
  faxios.create().use(refreshOn401);

  // @ts-expect-error TS2339 -- static helpers exist only on the default export
  void faxios.create().mergeConfig;

  // @ts-expect-error TS2339 -- the built-in plugins moved to faxios/plugins
  void faxios.plugins;

  // @ts-expect-error TS2339 -- use() is typed only on the instance create() returns
  new Faxios().use(addHeader);
}

void rootRetry;

// @ts-expect-error TS2694 -- internal: use() infers through it, users write FaxiosPlugin
export type RootPluginBase = import("faxios").FaxiosPluginBase;
// @ts-expect-error TS2694 -- internal: use() infers through it, users write FaxiosPlugin
export type RootPluginArgument = import("faxios").FaxiosPluginArgument;

void middleware;
