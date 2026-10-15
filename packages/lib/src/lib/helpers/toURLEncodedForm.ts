"use strict";

import type { FormSerializerOptions } from "../types.js";
import toFormData from "./toFormData.js";

export default function toURLEncodedForm(data: unknown, options?: FormSerializerOptions) {
  return toFormData(data, new URLSearchParams(), { ...options });
}
