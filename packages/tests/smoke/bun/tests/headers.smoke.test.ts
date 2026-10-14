import { describe, expect, test } from "bun:test";
import faxios from "faxios";
import { createRecordingFetch } from "./helpers.ts";

describe("headers", () => {
  test("custom X-Custom header is forwarded to mock fetch (case-insensitive)", async () => {
    const { fetch, calls } = createRecordingFetch();

    await faxios.get("https://example.com/custom-headers", { headers: { "X-Custom": "trace-123" }, env: { fetch } });

    expect(calls[0]!.headers.get("x-custom")).toBe("trace-123");
  });

  test("content-type application/json is inferred for JSON POST body", async () => {
    const { fetch, calls } = createRecordingFetch();

    await faxios.post("https://example.com/post-json", { name: "widget" }, { env: { fetch } });

    expect(calls[0]!.headers.get("content-type")).toContain("application/json");
  });
});
