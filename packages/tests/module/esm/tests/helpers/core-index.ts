// Type-checked fixture (NO @ts-nocheck) guarding faxios/core, faxios/schema and faxios/form:
// - each entry's exports exist, and faxios/core has no default instance and no statics
// - a faxios/core instance types no schema option until use(schema()), and no formSerializer
//   until use(form()); the test also checks each directive's error code (TS2769 for the schema
//   option on a request method)
// - after use(schema()) a responseSchema types the response data
// - use(schema()) and use(form()) chain, and the result still takes plugins
// - FaxiosCoreInstance names the instance create() returns
import { CanceledError, create, FaxiosError, FaxiosHeaders, isCancel, isFaxiosError } from "faxios/core";
import type { FaxiosCoreInstance, FaxiosMiddleware } from "faxios/core";
// @ts-expect-error TS2305 -- faxios/core builds no default instance, so it has no faxios export
import { faxios as coreFaxios } from "faxios/core";
// @ts-expect-error TS2305 -- the axios-compat statics stay on the root
import { HttpStatusCode } from "faxios/core";
import { form, formToJSON, toFormData } from "faxios/form";
import type { FormRequestOptions } from "faxios/form";
import { isSchemaValidationError, schema } from "faxios/schema";
import type { SchemaRequestOptions, StandardSchemaV1 } from "faxios/schema";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

// A hand-written Standard Schema: text in, number out.
const textToNumber: StandardSchemaV1<string, number> = {
  "~standard": {
    version: 1,
    vendor: "module-fixture",
    validate: (value: unknown) => (typeof value === "string" ? { value: Number(value) } : { issues: [{ message: "expected text" }] }),
  },
};

const addHeader: FaxiosMiddleware = async (ctx, next) => {
  ctx.config.headers.set("X-Fixture", "1");
  return next(ctx);
};

async function core(): Promise<void> {
  const api: FaxiosCoreInstance = create({ baseURL: "https://api.example.com" });

  // @ts-expect-error TS2769 -- responseSchema is typed only after use(schema())
  void api.get("/users/1", { responseSchema: textToNumber });
  // @ts-expect-error TS2353 -- formSerializer is typed only after use(form())
  void api.getUri({ formSerializer: { dots: true } });
  // @ts-expect-error TS2353 -- define() takes no schemas without the schema feature
  void api.define("get", "/users/1", { responseSchema: textToNumber });

  const plain = await api.get<{ id: number; }>("/users/1", { params: { id: 1 } });
  const plainId: number = plain.data.id;
  void plainId;

  const full = api.use(schema()).use(form())
    .use(addHeader);
  const typed = await full.get("/users/1", { responseSchema: textToNumber });
  const typedData: Equal<typeof typed.data, number> = true;
  void typedData;
  void full.getUri({ url: "/", params: { filter: { a: 1 } }, formSerializer: { dots: true } });
  void full.postForm("/upload", { name: "a" });

  const schemaOptions: SchemaRequestOptions = { responseSchema: textToNumber };
  const formOptions: FormRequestOptions = { formSerializer: { indexes: true } };
  void schemaOptions;
  void formOptions;

  try {
    await full.get("/users/1", { responseSchema: textToNumber });
  }
  catch (error) {
    if (isSchemaValidationError(error)) void error.issues;
    if (isFaxiosError(error)) void error.code;
    if (isCancel(error)) void error.message;
  }
}

void core;
void coreFaxios;
void HttpStatusCode;
void [ CanceledError, FaxiosError, FaxiosHeaders, formToJSON, toFormData ];
