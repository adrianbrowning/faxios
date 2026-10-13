// @ts-self-types="./form.d.ts" — required for Deno: src/form.ts re-exports form and formToJSON from here
// The form feature: serializes form bodies (multipart/form-data, x-www-form-urlencoded, FileList,
// FormData sent as JSON) and nested `params` with toFormData.

import { defineFeature } from "../core/features.js";
import { serializeFormParams } from "../helpers/FaxiosURLSearchParams.js";
import formDataToJSON from "../helpers/formDataToJSON.js";
import toFormData from "../helpers/toFormData.js";
import toURLEncodedForm from "../helpers/toURLEncodedForm.js";
import type { FaxiosFeaturePlugin } from "../types.js";
import { isHTMLForm } from "../utils.js";

/**
 * Serializes object bodies sent as `multipart/form-data` or `application/x-www-form-urlencoded`
 * (and by `postForm`, `putForm` and `patchForm`), FileList bodies, FormData sent as JSON, and
 * nested `params` (`a[b]=1`), and accepts the `formSerializer` option. Install it with `use()` on
 * an instance from `@gcmdev/faxios/core`; the root entry installs it on every instance. Without
 * it, those bodies and nested params reject with `ERR_NOT_SUPPORT`.
 */
export function form(): FaxiosFeaturePlugin<"form"> {
  return defineFeature("form", {
    formDataToJSON,
    serializeParams: serializeFormParams,
    toFormData,
    toURLEncoded: (data, options) => String(toURLEncodedForm(data, options)),
  });
}

/** Converts a FormData, or an HTML form element's fields, to a plain object (`a[b]` keys nest). */
export function formToJSON(thing: unknown): unknown {
  const GlobalFormData = (globalThis as Record<string, unknown>)["FormData"] as (new (el?: unknown) => unknown) | undefined;
  return formDataToJSON(isHTMLForm(thing) && GlobalFormData ? new GlobalFormData(thing) : thing);
}
