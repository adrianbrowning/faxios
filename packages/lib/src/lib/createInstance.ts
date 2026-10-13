// @ts-self-types="./createInstance.d.ts" — required for Deno: src/core.ts re-exports FaxiosInstance from here
// Builds the callable instances `create()` returns, for the root entry and `@gcmdev/faxios/core`
// alike, and types them.

import type { BasePerCallConfig, DefineConfig, DefinedEndpoint } from "./core/define.js";
import Faxios, { ejectMiddleware, useMiddleware } from "./core/Faxios.js";
import { featureDefinition } from "./core/features.js";
import mergeConfig from "./core/mergeConfig.js";
import type { CoreRouteBuilder, RouteBuilder, RouteConfig } from "./core/route.js";
import type {
  FaxiosDefaults,
  FaxiosFeature,
  FaxiosFeaturePlugin,
  FaxiosHeaderValue,
  FaxiosMiddleware,
  FaxiosPluginArgument,
  FaxiosRequestConfig,
  FaxiosRequestConfigFor,
  FaxiosResponse,
  HeadersDefaults,
  Method,
  MissingFeatureKeys,
  ResponseTypedConfig,
  SchemaConfig,
  StringLiteralsOrString
} from "./types.js";
import type { StandardSchemaV1 } from "./types/standard-schema.js";
import { extend } from "./utils.js";

// A new instance has no plugin options or capabilities, as FaxiosInstance's `{}` defaults say.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- see above
type NewInstance<TFeatures extends FaxiosFeature> = FaxiosInstance<{}, {}, TFeatures>;

/**
 * Create an instance of Faxios with `features` installed. Its `create()` makes instances with the
 * same features, plus the ones installed on it with `use()`; middleware and other plugins aren't
 * copied.
 */
export function createInstance<TFeatures extends FaxiosFeature>(
  defaultConfig: FaxiosRequestConfig,
  features: ReadonlyArray<FaxiosFeaturePlugin<TFeatures>>
): NewInstance<TFeatures> {
  const context = new Faxios(defaultConfig);
  const instance = (Faxios.prototype.request as (...args: Array<unknown>) => unknown).bind(context) as unknown as NewInstance<TFeatures>;

  // Copy faxios.prototype to instance. The instance is a callable populated
  // dynamically here; extend mutates it via own-key copy.
  const target = instance as unknown as Record<string, unknown>;
  extend(target, Faxios.prototype, context, { allOwnKeys: true });

  // Copy context to instance
  extend(target, context, null, { allOwnKeys: true });

  // The feature plugins a child from create() starts with: this instance's, as use() installs them.
  let installed: ReadonlyArray<FaxiosFeaturePlugin<TFeatures>> = [];

  // use() and eject() aren't Faxios members, so the instance gets them here. use() returns the
  // callable instance for chaining. At runtime it only registers the middleware; the plugin rules
  // live in FaxiosInstance["use"], so the cast is the single place the phantom TOpts/TCaps
  // refinement meets the untyped registry.
  const use = (middleware: Parameters<typeof useMiddleware>[1]) => {
    useMiddleware(context, middleware);
    if (featureDefinition(middleware)) installed = [ ...installed, middleware as FaxiosFeaturePlugin<TFeatures> ];
    return instance;
  };
  instance.use = use as typeof instance.use;
  instance.eject = (middleware: unknown) => {
    ejectMiddleware(context, middleware);
    const index = installed.indexOf(middleware as FaxiosFeaturePlugin<TFeatures>);
    if (index !== -1) installed = installed.filter((_, i) => i !== index);
  };

  // Factory for creating new instances
  instance.create = function create(instanceConfig?: FaxiosRequestConfig) {
    return createInstance(mergeConfig(defaultConfig, instanceConfig), installed);
  };

  features.forEach(use);

  return instance;
}

// Keys of TNeed that THave lacks, or provides with an incompatible type.
type MissingCapabilities<THave, TNeed> = {
  [K in keyof TNeed]: K extends keyof THave ? (THave[K] extends TNeed[K] ? never : K) : K;
}[keyof TNeed];

// `unknown` when THave satisfies TNeed; otherwise a required brand property whose name explains
// the fix and whose value names the missing capabilities, so the compiler error points at them.
type RequireCapabilities<THave, TNeed> = [MissingCapabilities<THave, TNeed>] extends [never]
  ? unknown
  : { "faxios: install a plugin that provides this capability first": MissingCapabilities<THave, TNeed>; };

// Capabilities TProv would provide that THave already has. use() throws ERR_BAD_OPTION for these at
// runtime, so they are a type error too.
type DuplicateCapabilities<THave, TProv> = Extract<keyof TProv, keyof THave>;

type RejectDuplicateCapabilities<THave, TProv> = [DuplicateCapabilities<THave, TProv>] extends [never]
  ? unknown
  : { "faxios: another installed plugin already provides this capability": DuplicateCapabilities<THave, TProv>; };

// A plugin that adds capabilities must carry them, however TProv was supplied (inferred, annotated
// or as an explicit type argument), so use() can't record a capability ctx.capabilities lacks.
// NoInfer: TypeScript infers into conditional branches, and this branch must stay a check only.
type RequireProvidesValue<TProv> = [keyof TProv] extends [never] ? unknown : { provides: NoInfer<TProv>; };

// use() skips a nullish provides, so it adds no capabilities. Without this, `provides: undefined`
// infers TProv as undefined and `TCaps & undefined` collapses to never, which satisfies every check.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no capabilities, as in FaxiosInstance
type ProvidedCapabilities<TProv> = [TProv] extends [null | undefined] ? {} : TProv;

// use() reads capability names with Object.keys() and skips the keys that could pollute a prototype,
// so the registry only holds string names. A symbol, number or dangerous key would be typed on
// ctx.capabilities without matching a registered name, and nothing could satisfy a requirement for one.
type UnsupportedCapabilityKeys<TCaps> = Extract<keyof TCaps, "__proto__" | "constructor" | "prototype" | number | symbol>;

type RejectUnsupportedCapabilityKeys<TReq, TProv> = [UnsupportedCapabilityKeys<TProv> | UnsupportedCapabilityKeys<TReq>] extends [never]
  ? unknown
  : { "faxios: capability names must be strings other than __proto__, constructor and prototype": UnsupportedCapabilityKeys<TProv> | UnsupportedCapabilityKeys<TReq>; };

// Nothing sets a plugin option for the caller, so a required one would be typed as present in the
// plugin's middleware while every request that omits it leaves it undefined.
type RequiredOptions<TOpt> = { [K in keyof TOpt]-?: object extends Pick<TOpt, K> ? never : K; }[keyof TOpt];

type RequireOptionalOptions<TOpt> = [RequiredOptions<TOpt>] extends [never]
  ? unknown
  : { "faxios: plugin request options must be optional": RequiredOptions<TOpt>; };

type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (value: infer I) => void ? I : never;
type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true;

// keyof a union holds only the keys every member shares, so a union of capability maps would check
// nothing. Which member applies can't be known, so a union is rejected.
type RejectUnionCapabilities<TReq, TProv> = IsUnion<TReq> extends true
  ? { "faxios: a plugin's required capabilities can't be a union": TReq; }
  : IsUnion<TProv> extends true ? { "faxios: a plugin's provided capabilities can't be a union": TProv; } : unknown;

type CheckPlugin<THave, TReq, TProv, TOpt> = RequireCapabilities<THave, TReq>
  & RejectDuplicateCapabilities<THave, TProv>
  & RequireProvidesValue<TProv>
  & RejectUnsupportedCapabilityKeys<TReq, TProv>
  & RequireOptionalOptions<TOpt>
  & RejectUnionCapabilities<TReq, TProv>;

// Members typed for the features F. Without the schema feature, SchemaConfig is `never`, so only
// the overload without a `responseSchema` applies.
type ConfigMember<TOpts, F> = {
  <O, D = unknown>(config: SchemaConfig<O, D, F> & TOpts): Promise<FaxiosResponse<O, D>>;
  <T = unknown, R = FaxiosResponse<T>, D = unknown>(config: ResponseTypedConfig<T, D, F> & TOpts): Promise<R>;
};

type UrlMember<TOpts, F> = {
  <O, D = unknown>(url: string, config: SchemaConfig<O, D, F> & TOpts): Promise<FaxiosResponse<O, D>>;
  <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: ResponseTypedConfig<T, D, F> & TOpts): Promise<R>;
};

type BodyMember<TOpts, F> = {
  <O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D, F> & TOpts): Promise<FaxiosResponse<O, D>>;
  <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: ResponseTypedConfig<T, D, F> & TOpts): Promise<R>;
};

type DefineMember<TOpts, F> = "schema" extends F
  ? <
    PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined = undefined,
    P extends StandardSchemaV1 | undefined = undefined,
    D extends StandardSchemaV1 | undefined = undefined,
    R extends StandardSchemaV1 | undefined = undefined
  >(
    method: StringLiteralsOrString<Method>,
    url: string,
    config?: DefineConfig<PP, P, D, R, F> & TOpts
  ) => DefinedEndpoint<PP, P, D, R, TOpts, F>
  : (
    method: StringLiteralsOrString<Method>,
    url: string,
    config?: BasePerCallConfig<F> & TOpts
  ) => DefinedEndpoint<undefined, undefined, undefined, undefined, TOpts, F>;

type RouteMember<TOpts, F> = "schema" extends F
  ? <PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined = undefined>(
    url: string,
    config?: RouteConfig<PP, F> & TOpts
  ) => RouteBuilder<PP, TOpts, F>
  : (url: string, config?: BasePerCallConfig<F> & TOpts) => CoreRouteBuilder<TOpts, F>;

/**
 * A faxios instance. `TOpts` holds the request options that installed plugins add to every
 * config-taking member; `TCaps` holds the capabilities installed plugins provide; `TFeatures` the
 * features installed: both on every instance the root entry creates, none on one from
 * `@gcmdev/faxios/core` until `use(schema())` or `use(form())`.
 */
// `{}` defaults: no plugin options or capabilities yet. Middleware written inline in use() is typed
// from these, so it can use `Object.keys(ctx.capabilities)` or `"name" in ctx.capabilities`
// without narrowing first.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- see above
export type FaxiosInstance<TOpts = {}, TCaps = {}, TFeatures extends FaxiosFeature = FaxiosFeature> = {
  /**
   * Define a typed endpoint for `method` and `url` (with optional `{key}` placeholders). `config`
   * holds request defaults and, with the schema feature, the `pathParamsSchema`, `paramsSchema`,
   * `requestSchema` and `responseSchema` to apply; schemas are locked at define time. Per-call
   * `url`, `method` and schemas are ignored, and `pathParams`, `params` and `data` are required
   * when their schema is set. The endpoint is a plain function that sends through this instance,
   * so add middleware with `.use()` on the instance, not on the endpoint.
   */
  define: DefineMember<TOpts, TFeatures>;
  /**
   * Remove middleware or a plugin registered with use(), by reference. In-flight requests are
   * unaffected. The instance type is not narrowed: request options, capabilities and features
   * the ejected plugin added stay in its type.
   */
  // A method, so its parameter is checked bivariantly: middleware typed for this instance's
  // options and capabilities is accepted.
  // eslint-disable-next-line @typescript-eslint/method-signature-style -- see above
  eject<TReq = unknown, TProv = unknown, TOpt = unknown>(middleware: FaxiosFeaturePlugin | FaxiosMiddleware<TOpt> | FaxiosPluginArgument<TReq, TProv, TOpt>): void;
  /**
   * Group endpoints that share `url` and `config`. Returns one endpoint factory per method (`get`,
   * `post`, `put`, `patch`, `delete`, `head`, `options`; no `query`), each taking request defaults
   * like `define()` and, with the schema feature, `paramsSchema`, `requestSchema` and
   * `responseSchema`. The route-level `pathParamsSchema` applies to every method and wins over a
   * method's. Endpoints are plain functions that send through this instance, so add middleware
   * with `.use()` on the instance.
   */
  route: RouteMember<TOpts, TFeatures>;
  /**
   * Register middleware, a plugin or a feature plugin (`schema()`, `form()`) and return this
   * instance, typed with what it adds. A plugin whose required capabilities aren't installed yet,
   * or that provides a capability another installed plugin already provides, is a type error.
   */
  use: <TReq = unknown, TProv = unknown, TOpt = unknown, TFeature extends FaxiosFeature = never>(
    middleware: FaxiosFeaturePlugin<TFeature> | FaxiosMiddleware<TOpts, TCaps> | (FaxiosPluginArgument<TReq, TProv, TOpt> & CheckPlugin<TCaps, TReq, TProv, TOpt>)
  ) => FaxiosInstance<TOpts & TOpt, TCaps & ProvidedCapabilities<TProv>, TFeature | TFeatures>;
  <O, D = unknown>(config: SchemaConfig<O, D, TFeatures> & TOpts): Promise<FaxiosResponse<O, D>>;
  <O, D = unknown>(url: string, config: SchemaConfig<O, D, TFeatures> & TOpts): Promise<FaxiosResponse<O, D>>;
  <T = unknown, R = FaxiosResponse<T>, D = unknown>(config: ResponseTypedConfig<T, D, TFeatures> & TOpts): Promise<R>;
  <T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: ResponseTypedConfig<T, D, TFeatures> & TOpts): Promise<R>;
  /**
   * Copy this instance's defaults, merged with `instanceConfig`, and its schema and form features
   * into a new instance. Middleware and other plugins aren't copied.
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- a new instance has no plugin options or capabilities
  create: (instanceConfig?: FaxiosRequestConfigFor<TFeatures>) => FaxiosInstance<{}, {}, TFeatures>;
  // `common` plus one header group per method; a key set directly on
  // `headers` applies to every method.
  defaults: Omit<FaxiosDefaults, "headers" | MissingFeatureKeys<TFeatures>> & {
    headers: HeadersDefaults & { [key: string]: FaxiosHeaderValue | undefined; };
  } & Partial<TOpts>;
  delete: UrlMember<TOpts, TFeatures>;
  get: UrlMember<TOpts, TFeatures>;
  /**
   * Build the URL for `config` without sending a request. Fills `{key}` placeholders from
   * `pathParams` and applies `baseURL`, `allowAbsoluteUrls`, `params` and `paramsSerializer`
   * like a request does. Schemas are not run, so `pathParams` is used as given.
   */
  getUri: (config?: FaxiosRequestConfigFor<TFeatures> & TOpts) => string;
  head: UrlMember<TOpts, TFeatures>;
  options: UrlMember<TOpts, TFeatures>;
  patch: BodyMember<TOpts, TFeatures>;
  /** PATCH with a `multipart/form-data` body; an object body needs the form feature, or rejects with `ERR_NOT_SUPPORT`. */
  patchForm: BodyMember<TOpts, TFeatures>;
  post: BodyMember<TOpts, TFeatures>;
  /** POST with a `multipart/form-data` body; an object body needs the form feature, or rejects with `ERR_NOT_SUPPORT`. */
  postForm: BodyMember<TOpts, TFeatures>;
  put: BodyMember<TOpts, TFeatures>;
  /** PUT with a `multipart/form-data` body; an object body needs the form feature, or rejects with `ERR_NOT_SUPPORT`. */
  putForm: BodyMember<TOpts, TFeatures>;
  query: BodyMember<TOpts, TFeatures>;
  request: ConfigMember<TOpts, TFeatures>;
};

/** An instance from `@gcmdev/faxios/core`: a FaxiosInstance with no features until `use(schema())` or `use(form())`. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no plugin options or capabilities yet, as in FaxiosInstance
export type FaxiosCoreInstance<TOpts = {}, TCaps = {}, TFeatures extends FaxiosFeature = never> = FaxiosInstance<TOpts, TCaps, TFeatures>;
