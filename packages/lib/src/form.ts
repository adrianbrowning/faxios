// @ts-self-types="./form.d.ts"
/* eslint-disable no-barrel-files/no-barrel-files */
// `@gcmdev/faxios/form`: the form feature for instances from `@gcmdev/faxios/core`, and the form
// helpers the root entry also exports.
export { form, formToJSON } from "./lib/features/form.ts";
export { default as toFormData } from "./lib/helpers/toFormData.ts";

export type { FormRequestOptions, FormSerializerOptions, GenericFormData, GenericHTMLFormElement } from "./lib/types.ts";
