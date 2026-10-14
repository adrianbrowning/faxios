import { assertEquals } from "@std/assert";
import faxios from "faxios";
import type { MockFetch } from "./helpers.ts";

// Never settles on its own: rejects with the signal's reason once faxios aborts it.
const pendingFetch: MockFetch = async (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init!.signal!;
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });

Deno.test("timeout: 50 with never-resolving fetch mock rejects with ETIMEDOUT", async () => {
  const err = await faxios
    .get("https://example.com/timeout", { timeout: 50, env: { fetch: pendingFetch } })
    .catch((e: unknown) => e);

  assertEquals(faxios.isFaxiosError(err), true);
  assertEquals(faxios.isFaxiosError(err) ? err.code : undefined, "ETIMEDOUT");
});
