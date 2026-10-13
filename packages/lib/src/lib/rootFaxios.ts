// @ts-self-types="./rootFaxios.d.ts" — required for Deno: src/index.ts re-exports Faxios from here
// The `Faxios` class the root entry exports: `new Faxios(config)` has the schema and form
// features every root instance has, so it behaves as it did before `@gcmdev/faxios/core`.

import CoreFaxios, { useMiddleware as install } from "./core/Faxios.js";
import { form } from "./features/form.js";
import { schema } from "./features/schema.js";
import type { FaxiosRequestConfig } from "./types.js";

class Faxios extends CoreFaxios {
  constructor(instanceConfig?: FaxiosRequestConfig) {
    super(instanceConfig);
    install(this, schema());
    install(this, form());
  }
}

export default Faxios;
