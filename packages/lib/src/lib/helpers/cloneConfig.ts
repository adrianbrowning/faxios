import type { FaxiosRequestConfig } from "../types.js";
import utils from "../utils.js";

// ponytail: null-proto shallow clone; replaces mergeConfig({}, config) which ran the full
// two-config merge machinery just to get a defensive copy. Security invariants preserved:
// null-proto so fetch.ts destructuring can't inherit Object.prototype gadgets, and
// dangerous keys filtered to block prototype-pollution write paths.
export default function cloneConfig<T extends FaxiosRequestConfig>(src: T): T & Record<string, unknown> {
  const dst = Object.create(null) as T & Record<string, unknown>;
  Object.defineProperty(dst, "hasOwnProperty", Object.assign(Object.create(null) as PropertyDescriptor, {
    value: Object.prototype.hasOwnProperty,
    writable: true,
    configurable: true,
    enumerable: false,
  }));
  for (const key of Object.keys(src)) {
    if (!utils.isDangerousKey(key)) {
      (dst as Record<string, unknown>)[key] = (src as Record<string, unknown>)[key];
    }
  }
  return dst;
}
