"use strict";

import type { GenericFormData } from "../types.js";
import toFormData from "./toFormData.js";

export default function toURLEncodedForm(data: unknown, options?: Record<string, unknown>) {
  return toFormData(data, new URLSearchParams() as unknown as GenericFormData, { ...options });
}
