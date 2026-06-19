"use strict";

import platform from "../platform/index.js";
import type { FormDataVisitorHelpers } from "../types.js";
import utils from "../utils.js";
import toFormData from "./toFormData.js";

export default function toURLEncodedForm(data: unknown, options?: Record<string, unknown>) {
  return toFormData(data, new platform.classes.URLSearchParams() as unknown as import("../types.js").GenericFormData, {
    visitor: function (this: { append: (name: string, value: unknown) => void; }, value: unknown, key: string | number, path: null | Array<string | number>, helpers: FormDataVisitorHelpers) {
      if (platform.isNode && utils.isBuffer(value)) {
        this.append(String(key), (value as Buffer).toString("base64"));
        return false;
      }

      return helpers.defaultVisitor.call(this, value, key, path, helpers);
    },
    ...options,
  });
}
