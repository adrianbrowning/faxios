import { create, FaxiosError } from "faxios/core";
import * as coreEntry from "faxios/core";
import { form, formToJSON, toFormData } from "faxios/form";
import { isSchemaValidationError, schema } from "faxios/schema";
import { describe, expect, it } from "vitest";

// A hand-written Standard Schema: text in, number out.
const textToNumber = {
  "~standard": {
    version: 1,
    vendor: "smoke",
    validate: value => (typeof value === "string" ? { value: Number(value) } : { issues: [{ message: "expected text" }] }),
  },
};

// Answers every request with the JSON string "7".
function recordingFetch() {
  const urls = [];
  const fetch = async (input, init) => {
    urls.push(new Request(input, init).url);
    return new Response("\"7\"", { headers: { "Content-Type": "application/json" } });
  };
  return { fetch, urls };
}

describe("faxios/core, faxios/schema and faxios/form (dist export only)", () => {
  it("exports create() and no default instance or statics from faxios/core", () => {
    expect(typeof create).toBe("function");
    expect(Object.hasOwn(coreEntry, "default")).toBe(false);
    expect(Object.hasOwn(coreEntry, "HttpStatusCode")).toBe(false);
    expect(typeof formToJSON).toBe("function");
    expect(typeof toFormData).toBe("function");
  });

  it("sends a GET with flat params and rejects schema options and nested params until their features are installed", async () => {
    const { fetch, urls } = recordingFetch();
    const api = create({ baseURL: "https://api.example.com", env: { fetch } });

    const response = await api.get("/users", { params: { id: 1 } });
    const schemaError = await api.get("/users", { responseSchema: textToNumber }).catch(error => error);
    const paramsError = await api.get("/users", { params: { filter: { a: 1 } } }).catch(error => error);

    expect(response.data).toBe("7");
    expect(urls).toEqual([ "https://api.example.com/users?id=1" ]);
    expect(schemaError).toBeInstanceOf(FaxiosError);
    expect(schemaError.code).toBe("ERR_BAD_OPTION");
    expect(paramsError.code).toBe("ERR_NOT_SUPPORT");
  });

  it("validates with use(schema()) and serializes nested params with use(form())", async () => {
    const { fetch, urls } = recordingFetch();
    const api = create({ baseURL: "https://api.example.com", env: { fetch } }).use(schema())
      .use(form());

    const response = await api.get("/users", { params: { filter: { a: 1 } }, responseSchema: textToNumber });
    const invalid = await api.get("/users", { responseSchema: { "~standard": { ...textToNumber["~standard"], validate: () => ({ issues: [{ message: "no" }] }) } } }).catch(error => error);

    expect(response.data).toBe(7);
    expect(urls[0]).toBe("https://api.example.com/users?filter%5Ba%5D=1");
    expect(isSchemaValidationError(invalid)).toBe(true);
  });
});
