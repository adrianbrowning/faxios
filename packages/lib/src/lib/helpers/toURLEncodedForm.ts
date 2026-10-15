"use strict";

import type { FormSerializerOptions } from "../types.js";
import type { WebURLSearchParams } from "../types/web.js";
import toFormData from "./toFormData.js";

export default function toURLEncodedForm(data: unknown, options?: FormSerializerOptions): WebURLSearchParams {
  return toFormData(data, new URLSearchParams(), { ...options });
}
