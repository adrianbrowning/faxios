"use strict";

import platform from "../platform.js";
import type { GenericFormData } from "../types.js";
import toFormData from "./toFormData.js";

export default function toURLEncodedForm(data: unknown, options?: Record<string, unknown>) {
  // ponytail: web-standard platform always provides global URLSearchParams
  return toFormData(
    data,
    new (platform.classes.URLSearchParams as new () => object)() as unknown as GenericFormData,
    { ...options }
  );
}
