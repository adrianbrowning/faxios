// @ts-self-types="./formToJSON.d.ts"
import { isHTMLForm } from "../utils.js";
import formDataToJSON from "./formDataToJSON.js";

/** Converts a `FormData` or an HTML form element to a plain object; `null` for anything else. */
export function formToJSON(thing: unknown): null | Record<string, unknown> {
  const GlobalFormData = (globalThis as Record<string, unknown>)["FormData"] as (new (el?: unknown) => unknown) | undefined;
  return formDataToJSON(isHTMLForm(thing) && GlobalFormData ? new GlobalFormData(thing) : thing);
}
