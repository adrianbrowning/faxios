"use strict";

// The header-layer rules: which config header layer beats which, for request() and for the
// defaults of a create() child. One level's headers (instance or request), lowest precedence
// first, are its `common` group, the group for the request's method, then its top-level headers;
// every request layer beats every instance layer, and every create() child layer beats every
// parent layer.

import type { HeadersDefaults } from "../types.js";
import { hasOwnProp, isArray, isDangerousKey, isObject, isPlainObject, isSafeIterable } from "../utils.js";
import FaxiosHeaders from "./FaxiosHeaders.js";
import type { HeaderInput } from "./FaxiosHeaders.js";

// Every method header group declared on HeadersDefaults. `satisfies` keeps this
// list exhaustive, so a group the types accept can never reach the wire.
const METHOD_HEADER_GROUPS = Object.keys({
  common: true,
  delete: true,
  get: true,
  head: true,
  options: true,
  post: true,
  put: true,
  patch: true,
  purge: true,
  link: true,
  unlink: true,
  query: true,
} satisfies Record<keyof HeadersDefaults, true>) as Array<keyof HeadersDefaults>;

/**
 * A FaxiosHeaders, Headers, Map or array of [name, value] pairs as a plain header object, so it
 * merges like one instead of replacing (or being replaced by) the other side's headers. Anything
 * else, an array that isn't all pairs included, is returned as it is.
 */
export function headersToObject(thing: unknown): unknown {
  if (thing instanceof FaxiosHeaders) return { ...thing };
  if (!isObject(thing) || isPlainObject(thing) || !isSafeIterable(thing)) return thing;
  if (isArray(thing) && !thing.every(entry => isArray(entry))) return thing;
  return { ...new FaxiosHeaders(thing as HeaderInput) };
}

// A group is an own object under a group name; a string under a group name is a real header.
function isHeaderGroup(headers: Record<string, unknown>, name: string): boolean {
  return METHOD_HEADER_GROUPS.includes(name as keyof HeadersDefaults) && hasOwnProp(headers, name) && isObject(headers[name]);
}

// One level's headers, lowest precedence first: the `common` group, the group for the request's
// method, then the top-level headers. A FaxiosHeaders, Headers or other iterable is one layer as
// it is. The config was validated as FaxiosConfigHeaders, so the casts name what each layer holds.
function headerLayers(headers: unknown, method: string): Array<HeaderInput> {
  if (!isPlainObject(headers)) return [ headers as HeaderInput ];
  const h = headers as Record<string, unknown>;
  const topLevel: Record<string, unknown> = Object.create(null);
  for (const name of Object.keys(h)) {
    if (!isHeaderGroup(h, name)) topLevel[name] = h[name];
  }
  return [
    isHeaderGroup(h, "common") ? h["common"] as HeaderInput : null,
    isHeaderGroup(h, method) ? h[method] as HeaderInput : null,
    topLevel as HeaderInput,
  ];
}

/**
 * The headers request() sends for `method`: each level flattened by headerLayers, then every
 * request header replaces the instance's, including a `null` or `false` there.
 */
export function flattenHeaders(instanceHeaders: unknown, requestHeaders: unknown, method: string): FaxiosHeaders {
  return FaxiosHeaders.concat(undefined, ...headerLayers(instanceHeaders, method))
    .set(FaxiosHeaders.concat(undefined, ...headerLayers(requestHeaders, method)), true);
}

// Removes every own key of `layer` that names `header`, case-insensitively.
function deleteHeader(layer: Record<string, unknown> | undefined, header: string): void {
  if (!layer) return;
  for (const key of Object.keys(layer)) {
    if (key.toLowerCase() === header) delete layer[key];
  }
}

// A child method group beats the parent for that method only. A parent top-level value beat the
// parent's groups, so it moves to `common`, where the child group beats it. A plain header
// literally named `common` leaves no room for the group, so the parent's then stays.
function yieldToChildGroup(
  top: Record<string, unknown>,
  groups: Partial<Record<keyof HeadersDefaults, Record<string, unknown>>>,
  method: keyof HeadersDefaults,
  header: string,
  deleteEverywhere: (header: string) => void
): void {
  const topKey = Object.keys(top).findLast(key => key.toLowerCase() === header);
  if (topKey !== undefined && !hasOwnProp(top, "common")) {
    const value = top[topKey];
    deleteEverywhere(header);
    groups.common ??= Object.create(null) as Record<string, unknown>;
    groups.common[topKey] = value;
  }
  deleteHeader(groups[method], header);
}

// Own string keys of a caller's header group in a null-prototype object, skipping the keys that
// could pollute a prototype. Never Object.assign: it runs getters and copies symbols.
function ownHeaderCopy(source: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(source)) {
    if (!isDangerousKey(key)) copy[key] = source[key];
  }
  return copy;
}

/**
 * The parent's headers for a create() child, with every header the child sets removed from the
 * parent layers it must beat. Deep-merging the result with the child's headers then gives each
 * method the headers flattenHeaders() would send for the same layers: any child layer, `common`
 * included, beats every parent layer, and a child method group applies to that method only.
 */
export function inheritHeaders(parentHeaders: unknown, childHeaders: unknown): unknown {
  const parent = headersToObject(parentHeaders);
  const child = headersToObject(childHeaders);
  if (!isPlainObject(parent) || !isPlainObject(child)) return parentHeaders;
  const p = parent as Record<string, unknown>;
  const c = child as Record<string, unknown>;
  const top: Record<string, unknown> = Object.create(null);
  const groups: Partial<Record<keyof HeadersDefaults, Record<string, unknown>>> = Object.create(null);
  // A caller object: own string keys only, skipping the ones that could pollute a prototype.
  for (const name of Object.keys(p)) {
    if (isHeaderGroup(p, name)) groups[name as keyof HeadersDefaults] = ownHeaderCopy(p[name] as Record<string, unknown>);
    else if (!isDangerousKey(name)) top[name] = p[name];
  }
  const deleteEverywhere = (header: string) => {
    deleteHeader(top, header);
    for (const group of Object.values(groups)) deleteHeader(group, header);
  };
  const everyMethod = [ ...Object.keys(c).filter(name => !isHeaderGroup(c, name)), ...isHeaderGroup(c, "common") ? Object.keys(c["common"] as object) : [] ];
  // Child top-level and `common` headers apply to every method, so they replace every parent layer.
  for (const name of everyMethod) deleteEverywhere(name.toLowerCase());
  for (const method of METHOD_HEADER_GROUPS) {
    if (method === "common" || !isHeaderGroup(c, method)) continue;
    for (const name of Object.keys(c[method] as object)) {
      yieldToChildGroup(top, groups, method, name.toLowerCase(), deleteEverywhere);
    }
  }
  return Object.assign(Object.create(null) as Record<string, unknown>, top, groups);
}
