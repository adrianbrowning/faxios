import { describe, expect, test } from "bun:test";
import faxios from "faxios";

const env = (fetch: typeof globalThis.fetch) => ({
  fetch,
  Request,
  Response,
});

describe("errors", () => {
  test("non-2xx response rejects with FaxiosError and status 404", async () => {
    const fetch = async () =>
      new Response(JSON.stringify({ error: "missing" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
      });

    const err = await faxios
      .get("https://example.com/missing", {
        adapter: "fetch",
        env: env(fetch),
      })
      .catch((e: any) => e);

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err.response.status).toBe(404);
  });

  test("faxios.isFaxiosError returns false for a plain Error", () => {
    expect(faxios.isFaxiosError(new Error("plain"))).toBe(false);
  });
});
