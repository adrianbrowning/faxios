// @ts-self-types="./schema.d.ts"
/* eslint-disable no-barrel-files/no-barrel-files */
// `@gcmdev/faxios/schema`: the schema feature for instances from `@gcmdev/faxios/core`.
export { schema } from "./lib/features/schema.ts";
export { isSchemaValidationError } from "./lib/core/FaxiosError.ts";

export type { SchemaValidationError } from "./lib/core/FaxiosError.ts";
export type { SchemaRequestOptions } from "./lib/types.ts";
export type { StandardSchemaV1 } from "./lib/types/standard-schema.ts";
