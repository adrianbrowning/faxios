import { assertEquals } from "@std/assert";
import faxios from "faxios";
import type { MockFetch } from "./helpers.ts";
import { jsonResponse } from "./helpers.ts";

Deno.test("errors: rejects with FaxiosError for 500", async () => {
  const fetch: MockFetch = async () => jsonResponse({ error: "boom" }, { status: 500, statusText: "Internal Server Error" });

  const err = await faxios.get("https://example.com/fail", { env: { fetch } }).catch((e: unknown) => e);

  assertEquals(faxios.isFaxiosError(err), true);
  assertEquals(faxios.isFaxiosError(err) ? [ err.response?.status, err.response?.data ] : undefined, [ 500, { error: "boom" }]);
});

Deno.test("errors: rejects with FaxiosError for 404", async () => {
  const fetch: MockFetch = async () => jsonResponse({ error: "missing" }, { status: 404, statusText: "Not Found" });

  const err = await faxios.get("https://example.com/missing", { env: { fetch } }).catch((e: unknown) => e);

  assertEquals(faxios.isFaxiosError(err) ? err.response?.status : undefined, 404);
});

Deno.test("errors: isFaxiosError returns false for plain Error", () => {
  assertEquals(faxios.isFaxiosError(new Error("plain")), false);
});
