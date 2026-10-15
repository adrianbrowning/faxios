import { assertEquals } from "@std/assert";
import faxios from "faxios";
import { createRecordingFetch } from "./helpers.ts";

Deno.test("middleware: header set before next() is forwarded to fetch", async () => {
  const { fetch, calls } = createRecordingFetch({ value: "ok" });
  const client = faxios.create({ env: { fetch } }).use(async (ctx, next) => {
    ctx.config.headers.set("X-Added", "yes");
    return next(ctx);
  });

  await client.get("https://example.com/middleware-request");

  assertEquals(calls.length, 1);
  assertEquals(calls[0]!.headers.get("x-added"), "yes");
});

Deno.test("middleware: change after next() is reflected in resolved value", async () => {
  const { fetch } = createRecordingFetch({ value: "ok" });
  const client = faxios.create({ env: { fetch } }).use(async (ctx, next) => {
    const response = await next(ctx);
    const { data } = response;
    const value = data && typeof data === "object" && "value" in data ? String(data.value) : "";
    return { ...response, data: { value: value.toUpperCase() } };
  });

  const response = await client.get("https://example.com/middleware-response");

  assertEquals(response.data, { value: "OK" });
});
