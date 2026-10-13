import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import { create, FaxiosError } from "faxios/core";
import * as coreEntry from "faxios/core";
import { form, formToJSON, toFormData } from "faxios/form";
import { isSchemaValidationError, schema } from "faxios/schema";
import type { StandardSchemaV1 } from "faxios/schema";

// A hand-written Standard Schema: text in, number out.
const textToNumber: StandardSchemaV1<string, number> = {
  "~standard": {
    version: 1,
    vendor: "deno-smoke",
    validate: (value: unknown) => (typeof value === "string" ? { value: Number(value) } : { issues: [{ message: "expected text" }] }),
  },
};
const rejectAll: StandardSchemaV1 = {
  "~standard": { version: 1, vendor: "deno-smoke", validate: () => ({ issues: [{ message: "no" }] }) },
};

// Answers every request with the JSON string "7".
function recordingFetch() {
  const urls: Array<string> = [];
  const fetch = async (input: Request | string | URL, init?: RequestInit) => {
    urls.push(new Request(input, init).url);
    return new Response("\"7\"", { headers: { "Content-Type": "application/json" } });
  };
  return { fetch, urls };
}

Deno.test("Deno core: faxios/core exports create() and no default instance or statics", () => {
  assertEquals(typeof create, "function");
  assertEquals(Object.hasOwn(coreEntry, "default"), false);
  assertEquals(Object.hasOwn(coreEntry, "HttpStatusCode"), false);
  assertEquals(typeof formToJSON, "function");
  assertEquals(typeof toFormData, "function");
});

Deno.test("Deno core: flat params work; schema options and nested params need their features", async () => {
  const { fetch, urls } = recordingFetch();
  const api = create({ baseURL: "https://api.example.com", env: { fetch } });

  const response = await api.get("/users", { params: { id: 1 } });
  const schemaError = await api.request({ url: "/users", ["responseSchema" as string]: textToNumber }).catch((error: unknown) => error);
  const paramsError = await api.get("/users", { params: { filter: { a: 1 } } }).catch((error: unknown) => error);

  assertEquals(response.data, "7");
  assertEquals(urls, [ "https://api.example.com/users?id=1" ]);
  assertInstanceOf(schemaError, FaxiosError);
  assertEquals(schemaError.code, "ERR_BAD_OPTION");
  assertInstanceOf(paramsError, FaxiosError);
  assertEquals(paramsError.code, "ERR_NOT_SUPPORT");
});

Deno.test("Deno core: use(schema()) validates and use(form()) serializes nested params", async () => {
  const { fetch, urls } = recordingFetch();
  const api = create({ baseURL: "https://api.example.com", env: { fetch } }).use(schema())
    .use(form());

  const response = await api.get("/users", { params: { filter: { a: 1 } }, responseSchema: textToNumber });
  const invalid = await api.get("/users", { responseSchema: rejectAll }).catch((error: unknown) => error);

  assertEquals(response.data, 7);
  assertEquals(urls[0], "https://api.example.com/users?filter%5Ba%5D=1");
  assert(isSchemaValidationError(invalid));
});
