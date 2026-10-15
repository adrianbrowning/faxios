import { assertEquals } from "@std/assert";
import faxios from "faxios";

const env = (fetch: (input: Request | string | URL, init?: RequestInit) => Promise<Response>) => ({
  fetch,
  Request,
  Response,
});

Deno.test("cancel: pre-aborted AbortController cancels request", async () => {
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
      signal: controller.signal as any,
      env: env(fetch),
    })
    .catch((e: any) => e);

  assertEquals(faxios.isCancel(err), true);
  assertEquals(err.code, "ERR_CANCELED");
  assertEquals(fetchCallCount, 0);
});

Deno.test("cancel: in-flight abort cancels request", async () => {
  const { promise: sent, resolve: send } = Promise.withResolvers<AbortSignal>();
  const fetch = async (_input: Request | string | URL, init?: RequestInit) => {
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

  assertEquals(faxios.isCancel(err), true);
  assertEquals(faxios.isFaxiosError(err) ? err.code : undefined, "ERR_CANCELED");
  assertEquals(fetchSignal.aborted, true);
});

Deno.test("cancel: isCancel returns false for plain Error", () => {
  assertEquals(faxios.isCancel(new Error("random")), false);
});
