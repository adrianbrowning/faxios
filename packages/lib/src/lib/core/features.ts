// The optional features `@gcmdev/faxios/schema` and `@gcmdev/faxios/form` install into dispatch.
// `./core` imports none of their code: an instance reaches it only through the plugin installed
// with `use()`, and the root entry installs both on every instance it creates.

import type { ParamsSerializer } from "../helpers/appendParams.js";
import type { FaxiosFeature, FaxiosFeaturePlugin, FaxiosResponse, GenericFormData, InternalFaxiosRequestConfig } from "../types.js";
import { hasOwnProp } from "../utils.js";
import FaxiosError from "./FaxiosError.js";

interface SchemaFeature {
  /** Validates the response body after `transformResponse`; called only with a `responseSchema`. */
  checkResponse: (config: InternalFaxiosRequestConfig, response: FaxiosResponse) => Promise<FaxiosResponse>;
  /**
   * Validates `pathParams`, `params` and `data` with their schemas, in that order, and fills the
   * URL placeholders. `undefined` when nothing needs to wait, so dispatch stays synchronous.
   */
  preFlight: (config: InternalFaxiosRequestConfig) => Promise<void> | undefined;
}

interface FormFeature {
  formDataToJSON: (formData: unknown) => unknown;
  serializeParams: ParamsSerializer;
  toFormData: (data: unknown, formData: GenericFormData | null | undefined, options: Record<string, unknown> | undefined) => GenericFormData;
  toURLEncoded: (data: unknown, options: Record<string, unknown> | undefined) => string;
}

/** The features installed on an instance. */
export interface Features {
  form?: FormFeature;
  schema?: SchemaFeature;
}

/** The request options each feature adds; core rejects them while the feature is missing. */
export const FEATURE_OPTIONS = {
  form: [ "formSerializer" ],
  schema: [ "pathParamsSchema", "paramsSchema", "requestSchema", "responseSchema" ],
} as const satisfies Record<FaxiosFeature, ReadonlyArray<string>>;

/** A feature plugin's registered implementation. */
export type FeatureDefinition = { [K in FaxiosFeature]: { feature: K; implementation: NonNullable<Features[K]>; }; }[FaxiosFeature];

// Keyed by the plugin object, so only schema() and form() can register an implementation: a
// look-alike object with the same fields installs nothing.
const definitions = new WeakMap<object, FeatureDefinition>();

export function defineFeature<K extends FaxiosFeature>(feature: K, implementation: NonNullable<Features[K]>): FaxiosFeaturePlugin<K> {
  const plugin: FaxiosFeaturePlugin<K> = Object.freeze({ feature, name: feature });
  definitions.set(plugin, { feature, implementation } as FeatureDefinition);
  return plugin;
}

export function featureDefinition(value: unknown): FeatureDefinition | undefined {
  return typeof value === "object" && value !== null ? definitions.get(value) : undefined;
}

const NO_FEATURES: Features = Object.freeze({});

// The default transformRequest and the fetch adapter only see the request config, so dispatch
// records which features the config's instance has. Weak keys: nothing outlives the config.
const bound = new WeakMap<object, Features>();

export function bindFeatures(config: InternalFaxiosRequestConfig, features: Features): void {
  bound.set(config, features);
}

export function featuresOf(config: unknown): Features {
  return (typeof config === "object" && config !== null && bound.get(config)) || NO_FEATURES;
}

const INSTALL = {
  form: "@gcmdev/faxios/form; install it with use(form())",
  schema: "@gcmdev/faxios/schema; install it with use(schema())",
} satisfies Record<FaxiosFeature, string>;

/** The form feature of the config's instance, or an `ERR_NOT_SUPPORT` naming `@gcmdev/faxios/form`. */
export function requireForm(config: unknown, what: string): FormFeature {
  const form = featuresOf(config).form;
  if (form) return form;
  throw new FaxiosError(`${what} needs ${INSTALL.form}`, FaxiosError.ERR_NOT_SUPPORT, config as InternalFaxiosRequestConfig);
}

/** `ERR_BAD_OPTION` for request option `key` of a feature the instance lacks. */
export function missingFeatureError(key: string, feature: FaxiosFeature, config: unknown): FaxiosError {
  return new FaxiosError(`Option ${key} needs ${INSTALL[feature]}`, FaxiosError.ERR_BAD_OPTION, config as InternalFaxiosRequestConfig);
}

/** Rejects a schema option that reached dispatch without the schema feature, e.g. set by middleware. */
export function assertNoSchemaOptions(config: InternalFaxiosRequestConfig): void {
  for (const key of FEATURE_OPTIONS.schema) {
    if (hasOwnProp(config, key) && config[key] !== undefined) throw missingFeatureError(key, "schema", config);
  }
}
