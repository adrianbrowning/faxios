import { assertEquals, assertStringIncludes } from "@std/assert";
import faxios from "faxios";
import { createRecordingFetch } from "./helpers.ts";

Deno.test("headers: default Accept header is sent", async () => {
  const { fetch, calls } = createRecordingFetch();

  await faxios.get("https://example.com/default-headers", { env: { fetch } });

  assertEquals(calls[0]!.headers.get("accept"), "application/json, text/plain, */*");
});

Deno.test("headers: custom headers are forwarded", async () => {
  const { fetch, calls } = createRecordingFetch();

  await faxios.get("https://example.com/custom-headers", {
    headers: { "X-Trace-Id": "trace-123", Authorization: "Bearer token-abc" },
    env: { fetch },
  });

  assertEquals(calls[0]!.headers.get("x-trace-id"), "trace-123");
  assertEquals(calls[0]!.headers.get("authorization"), "Bearer token-abc");
});

Deno.test("headers: content-type is set for JSON POST payload", async () => {
  const { fetch, calls } = createRecordingFetch();

  await faxios.post("https://example.com/post-json", { name: "widget" }, { env: { fetch } });

  assertStringIncludes(calls[0]!.headers.get("content-type") ?? "", "application/json");
});

Deno.test("headers: content-type is absent for bodyless GET", async () => {
  const { fetch, calls } = createRecordingFetch();

  await faxios.get("https://example.com/get-no-body", { env: { fetch } });

  assertEquals(calls[0]!.headers.get("content-type"), null);
});
