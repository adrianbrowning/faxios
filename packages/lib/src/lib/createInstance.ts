import Faxios, { childDefaults, ejectMiddleware, useMiddleware } from "./core/Faxios.js";
import type { FaxiosInstance } from "./faxios.js";
import type { CreateFaxiosDefaults, FaxiosRequestConfig } from "./types.js";
import { extend } from "./utils.js";

/**
 * Create an instance of Faxios
 *
 * @param {Object} defaultConfig The default config for the instance
 * @param {Faxios} context The Faxios the instance dispatches through; a new one by default
 *
 * @returns {Faxios} A new instance of Faxios
 */
export function createInstance(defaultConfig: FaxiosRequestConfig, context = new Faxios(defaultConfig)): FaxiosInstance {
  const instance = (Faxios.prototype.request as (...args: Array<unknown>) => unknown).bind(context) as unknown as FaxiosInstance;

  // Copy faxios.prototype to instance. The instance is a callable populated
  // dynamically here; extend mutates it via own-key copy.
  const target = instance as unknown as Record<string, unknown>;
  extend(target, Faxios.prototype, context, { allOwnKeys: true });

  // Copy context to instance
  extend(target, context, null, { allOwnKeys: true });

  // use() and eject() aren't Faxios members, so the instance gets them here. use() returns the
  // callable instance for chaining. At runtime it only registers the middleware; the plugin rules
  // live in FaxiosInstance["use"], so the cast is the single place the phantom TOpts/TCaps
  // refinement meets the untyped registry.
  const use = (middleware: Parameters<typeof useMiddleware>[1]): FaxiosInstance => {
    useMiddleware(context, middleware);
    return instance;
  };
  instance.use = use as FaxiosInstance["use"];
  instance.eject = (middleware: unknown) => {
    ejectMiddleware(context, middleware);
  };

  // Factory for creating new instances. Middleware isn't copied, so neither are the defaults for
  // its plugins' options.
  instance.create = function create(instanceConfig?: CreateFaxiosDefaults): FaxiosInstance {
    return createInstance(childDefaults(context, instanceConfig));
  };

  return instance;
}
