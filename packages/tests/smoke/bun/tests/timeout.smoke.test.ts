import { describe, expect, test } from "bun:test";
import faxios from "faxios";
import type { MockFetch } from "./helpers.ts";

// Never settles on its own: rejects with the signal's reason once faxios aborts it.
const pendingFetch: MockFetch = async (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init!.signal!;
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });

// Real timers on purpose: this smoke run has no fake-timer API it can rely on (bun:test has no timer advancing), and the
// point is to check the dist build's timeout against the runtime's own setTimeout. The wait is 50 ms.
describe("timeout", () => {
  test("timeout: 50 with never-resolving fetch mock rejects with ETIMEDOUT", async () => {
    const err = await faxios
      .get("https://example.com/timeout", { timeout: 50, env: { fetch: pendingFetch } })
      .catch((e: unknown) => e);

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err).toMatchObject({ code: "ETIMEDOUT" });
  });
});
