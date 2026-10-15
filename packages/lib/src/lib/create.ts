// @ts-self-types="./create.d.ts"
import Faxios, { childDefaults } from "./core/Faxios.js";
import { createInstance } from "./createInstance.js";
import defaults from "./defaults/index.js";
import type { FaxiosInstance } from "./faxios.js";
import type { CreateFaxiosDefaults } from "./types.js";

// The Faxios the default instance dispatches through. It lives here, not in faxios.ts, so the
// named `create` export doesn't keep the default instance in a consumer bundle.
export const defaultContext = /* @__PURE__ */ new Faxios(defaults);

/** Creates an instance that inherits the default instance's defaults, as `faxios.create` does. */
export function create(instanceConfig?: CreateFaxiosDefaults): FaxiosInstance {
  return createInstance(childDefaults(defaultContext, instanceConfig));
}
