import { describe, it, expect } from "vitest";
import faxios from "#src/index.ts";

function captureBody() {
  const seen: { body: unknown; } = { body: undefined };
  const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    seen.body = init?.body;
    return new Response("{}", { headers: { "Content-Type": "application/json" } });
  };
  return { seen, fetch };
}

const multipart = { headers: { "Content-Type": "multipart/form-data" } } as const;

describe("env.FormData", () => {
  it("serializes a multipart object payload with the configured constructor", async () => {
    class CustomFormData extends FormData {}
    const { seen, fetch } = captureBody();

    await faxios.post("http://example.test/", { a: "1" }, { ...multipart, env: { FormData: CustomFormData, fetch } });

    expect(seen.body).toBeInstanceOf(CustomFormData);
    expect((seen.body as FormData).get("a")).toBe("1");
  });

  it("falls back to the global FormData when set to null", async () => {
    const { seen, fetch } = captureBody();

    await faxios.post("http://example.test/", { a: "1" }, { ...multipart, env: { FormData: null, fetch } });

    expect(seen.body).toBeInstanceOf(FormData);
    expect((seen.body as FormData).get("a")).toBe("1");
  });
});
