import AxiosError from "../core/AxiosError.js";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "../types.js";
import utils from "../utils.js";
import * as fetchAdapter from "./fetch.js";
import httpAdapter from "./http.js";
import xhrAdapter from "./xhr.js";

/**
 * Known adapters mapping.
 * Provides environment-specific adapters for Axios:
 * - `http` for Node.js
 * - `xhr` for browsers
 * - `fetch` for fetch API-based requests
 *
 * @type {Object<string, Function|Object>}
 */
const knownAdapters = {
  http: httpAdapter,
  xhr: xhrAdapter,
  fetch: {
    get: fetchAdapter.getFetch,
  },
};

// Assign adapter names for easier debugging and identification
utils.forEach(knownAdapters, (fn, value) => {
  if (fn) {
    try {
      // Null-proto descriptors so a polluted Object.prototype.get cannot turn
      // these data descriptors into accessor descriptors on the way in.
      Object.defineProperty(
        fn,
        "name",
        Object.assign(Object.create(null) as PropertyDescriptor, { value })
      );
    }
    catch (_e) {
       
      // ignore: defineProperty may throw in strict envs
    }
    Object.defineProperty(
      fn,
      "adapterName",
      Object.assign(Object.create(null) as PropertyDescriptor, { value })
    );
  }
});

/**
 * Render a rejection reason string for unknown or unsupported adapters
 *
 * @param {string} reason
 * @returns {string}
 */
const renderReason = (reason: string) => `- ${reason}`;

/**
 * Check if the adapter is resolved (function, null, or false)
 *
 * @param {Function|null|false} adapter
 * @returns {boolean}
 */
const isResolvedHandle = (adapter: unknown) =>
  utils.isFunction(adapter) || adapter === null || adapter === false;

/**
 * Get the first suitable adapter from the provided list.
 * Tries each adapter in order until a supported one is found.
 * Throws an AxiosError if no adapter is suitable.
 *
 * @param {Array<string|Function>|string|Function} adapters - Adapter(s) by name or function.
 * @param {Object} config - Axios request configuration
 * @throws {AxiosError} If no suitable adapter is available
 * @returns {Function} The resolved adapter function
 */

function getAdapter(
  adapters: unknown,
  config: InternalAxiosRequestConfig
): AxiosAdapter {
  adapters = utils.isArray(adapters) ? adapters : [ adapters ];

  const { length } = adapters as Array<unknown>;
  let nameOrAdapter: unknown;
  let adapter: unknown;

  const rejectedReasons: Record<string, unknown> = {};

  for (let i = 0; i < length; i++) {
    nameOrAdapter = (adapters as Array<unknown>)[i];
    let id: string | undefined;

    adapter = nameOrAdapter;

    if (!isResolvedHandle(nameOrAdapter)) {
      id = String(nameOrAdapter);
      adapter = (knownAdapters as Record<string, unknown>)[id.toLowerCase()];

      if (adapter === undefined) {
        throw new AxiosError(`Unknown adapter '${id}'`);
      }
    }

    if (!utils.isFunction(adapter) && adapter) {
      adapter = (adapter as { get: (config: unknown) => unknown; }).get(config);
    }
    if (adapter) {
      break;
    }

    rejectedReasons[id ?? "#" + i] = adapter;
  }

  if (!adapter) {
    const reasons = Object.entries(rejectedReasons).map(
      ([ id, state ]) =>
        `adapter ${id} ` +
        (state === false
          ? "is not supported by the environment"
          : "is not available in the build")
    );

    let s;
    if (!length) {
      s = "as no adapter specified";
    }
    else if (reasons.length > 1) {
      s = "since :\n" + reasons.map(renderReason).join("\n");
    }
    else {
      s = " " + renderReason(reasons[0] ?? "");
    }

    throw new AxiosError(
      `There is no suitable adapter to dispatch the request ` + s,
      "ERR_NOT_SUPPORT"
    );
  }

  return adapter as AxiosAdapter;
}

/**
 * Exports Axios adapters and utility to resolve an adapter
 */
export default {
  /**
   * Resolve an adapter from a list of adapter names or functions.
   * @type {Function}
   */
  getAdapter,

  /**
   * Exposes all known adapters
   * @type {Object<string, Function|Object>}
   */
  adapters: knownAdapters,
};
