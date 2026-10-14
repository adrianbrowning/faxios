import { describe, expect, test } from "bun:test";
import faxios from "faxios";
import type { MockFetch } from "./helpers.ts";
import { jsonResponse } from "./helpers.ts";

describe("errors", () => {
  test("non-2xx response rejects with FaxiosError and status 404", async () => {
    const fetch: MockFetch = async () => jsonResponse({ error: "missing" }, { status: 404, statusText: "Not Found" });

    const err = await faxios.get("https://example.com/missing", { env: { fetch } }).catch((e: unknown) => e);

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err).toMatchObject({ response: { status: 404, data: { error: "missing" } } });
  });

  test("faxios.isFaxiosError returns false for a plain Error", () => {
    expect(faxios.isFaxiosError(new Error("plain"))).toBe(false);
  });
});
