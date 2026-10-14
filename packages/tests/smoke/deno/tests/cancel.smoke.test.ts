import { assertEquals } from "@std/assert";
import faxios from "faxios";
import type { MockFetch } from "./helpers.ts";
import { jsonResponse } from "./helpers.ts";

Deno.test("cancel: pre-aborted AbortController cancels request", async () => {
  let fetchCallCount = 0;
  const fetch: MockFetch = async () => {
    fetchCallCount += 1;
    return jsonResponse({ ok: true });
  };

  const controller = new AbortController();
  controller.abort();

  const err = await faxios
    .get("https://example.com/cancel", { signal: controller.signal, env: { fetch } })
    .catch((e: unknown) => e);

  assertEquals(faxios.isCancel(err), true);
  assertEquals(faxios.isFaxiosError(err) ? err.code : undefined, "ERR_CANCELED");
  assertEquals(fetchCallCount, 0);
});

Deno.test("cancel: in-flight abort cancels request", async () => {
  const { promise: sent, resolve: send } = Promise.withResolvers<AbortSignal>();
  const fetch: MockFetch = async (_input, init) => {
    const signal = init!.signal!;
    send(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  };

  const controller = new AbortController();

  const request = faxios.get("https://example.com/in-flight", { signal: controller.signal, env: { fetch } });

  // Abort once fetch has the request, so the abort has to reach the fetch itself.
  const fetchSignal = await sent;
  controller.abort();

  const err = await request.catch((e: unknown) => e);

  assertEquals(faxios.isCancel(err), true);
  assertEquals(faxios.isFaxiosError(err) ? err.code : undefined, "ERR_CANCELED");
  assertEquals(fetchSignal.aborted, true);
});

Deno.test("cancel: isCancel returns false for plain Error", () => {
  assertEquals(faxios.isCancel(new Error("random")), false);
});
