import { describe, expect, test } from "bun:test";
import faxios from "faxios";

const env = (fetch: typeof globalThis.fetch) => ({
  fetch,
  Request,
  Response,
});

describe("cancellation", () => {
  test("pre-aborted AbortController cancels before fetch is called", async () => {
    let fetchCallCount = 0;

    const fetch = async () => {
      fetchCallCount += 1;

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const controller = new AbortController();
    controller.abort();

    const err = await faxios
      .get("https://example.com/cancel", {
        signal: controller.signal,
        env: env(fetch),
      })
      .catch((e: any) => e);

    expect(faxios.isCancel(err)).toBe(true);
    expect(err.code).toBe("ERR_CANCELED");
    expect(fetchCallCount).toBe(0);
  });

  test("in-flight AbortController abort cancels the request", async () => {
    const { promise: sent, resolve: send } = Promise.withResolvers<AbortSignal>();
    const fetch = async (_input: unknown, init?: RequestInit) => {
      const signal = init!.signal!;
      send(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    };

    const controller = new AbortController();

    const request = faxios.get("https://example.com/in-flight", {
      signal: controller.signal,
      env: env(fetch),
    });

    // Abort once fetch has the request, so the abort has to reach the fetch itself.
    const fetchSignal = await sent;
    controller.abort();

    const err = await request.catch((e: unknown) => e);

    expect(faxios.isCancel(err)).toBe(true);
    expect(err).toMatchObject({ code: "ERR_CANCELED" });
    expect(fetchSignal.aborted).toBe(true);
  });

  test("faxios.isCancel returns false for a plain Error", () => {
    expect(faxios.isCancel(new Error("random"))).toBe(false);
  });
});
