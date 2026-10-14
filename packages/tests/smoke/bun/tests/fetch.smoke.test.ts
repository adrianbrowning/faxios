import { describe, expect, test } from "bun:test";
import faxios from "faxios";
import { createRecordingFetch } from "./helpers.ts";

describe("fetch adapter", () => {
  test("GET resolves JSON response via fetch adapter", async () => {
    const { fetch, calls } = createRecordingFetch();

    const response = await faxios.get("https://example.com/users", { env: { fetch } });

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
  });

  test("POST serializes JSON body via fetch adapter", async () => {
    const { fetch, calls } = createRecordingFetch();

    await faxios.post("https://example.com/items", { name: "widget" }, { env: { fetch } });

    expect(await calls[0]!.text()).toBe(JSON.stringify({ name: "widget" }));
  });

  test("HTTP methods are forwarded correctly", async () => {
    const { fetch, calls } = createRecordingFetch();

    await faxios.delete("https://example.com/items", { env: { fetch } });
    await faxios.head("https://example.com/items", { env: { fetch } });
    await faxios.options("https://example.com/items", { env: { fetch } });
    await faxios.put("https://example.com/items", { name: "widget" }, { env: { fetch } });
    await faxios.patch("https://example.com/items", { name: "widget" }, { env: { fetch } });

    expect(calls.map(call => call.method)).toEqual([ "DELETE", "HEAD", "OPTIONS", "PUT", "PATCH" ]);
  });

  test("full URL is preserved in the fetch request", async () => {
    const { fetch, calls } = createRecordingFetch();

    await faxios.get("https://example.com/users", { env: { fetch } });

    expect(calls[0]!.url).toBe("https://example.com/users");
  });
});
