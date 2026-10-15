import { assertEquals } from "@std/assert";
import faxios from "faxios";
import { createRecordingFetch } from "./helpers.ts";

Deno.test("fetch adapter: GET resolves JSON response", async () => {
  const { fetch, calls } = createRecordingFetch();

  const response = await faxios.get("https://example.com/users", { env: { fetch } });

  assertEquals(response.status, 200);
  assertEquals(response.data, { ok: true });
  assertEquals(calls.length, 1);
});

Deno.test("fetch adapter: forwards HTTP methods", async () => {
  const { fetch, calls } = createRecordingFetch();

  await faxios.delete("https://example.com/items", { env: { fetch } });
  await faxios.head("https://example.com/items", { env: { fetch } });
  await faxios.options("https://example.com/items", { env: { fetch } });
  await faxios.post("https://example.com/items", { name: "widget" }, { env: { fetch } });
  await faxios.put("https://example.com/items", { name: "widget" }, { env: { fetch } });
  await faxios.patch("https://example.com/items", { name: "widget" }, { env: { fetch } });

  assertEquals(calls.map(call => call.method), [ "DELETE", "HEAD", "OPTIONS", "POST", "PUT", "PATCH" ]);
});

Deno.test("fetch adapter: serializes JSON body for POST", async () => {
  const { fetch, calls } = createRecordingFetch();

  await faxios.post("https://example.com/items", { name: "widget" }, { env: { fetch } });

  assertEquals(await calls[0]!.text(), JSON.stringify({ name: "widget" }));
});

Deno.test("fetch adapter: forwards full URL", async () => {
  const { fetch, calls } = createRecordingFetch();

  await faxios.get("https://example.com/users", { env: { fetch } });

  assertEquals(calls[0]!.url, "https://example.com/users");
});
