import { describe, expect, test } from "bun:test";
import faxios from "faxios";
import { createRecordingFetch } from "./helpers.ts";

describe("middleware", () => {
  test("middleware header is forwarded to fetch", async () => {
    const { fetch, calls } = createRecordingFetch({ value: "ok" });
    const client = faxios.create({ env: { fetch } }).use(async (ctx, next) => {
      ctx.config.headers.set("X-Added", "yes");
      return next(ctx);
    });

    await client.get("https://example.com/middleware-request");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.get("x-added")).toBe("yes");
  });

  test("middleware change after next() is reflected in resolved value", async () => {
    const { fetch } = createRecordingFetch({ value: "ok" });
    const client = faxios.create({ env: { fetch } }).use(async (ctx, next) => {
      const response = await next(ctx);
      const { data } = response;
      const value = data && typeof data === "object" && "value" in data ? String(data.value) : "";
      return { ...response, data: { value: value.toUpperCase() } };
    });

    const response = await client.get("https://example.com/middleware-response");

    expect(response.data).toEqual({ value: "OK" });
  });
});
