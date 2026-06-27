import { assertEquals } from "@std/assert";
import faxios from "faxios";

const env = (fetch: any): any => ({
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
      adapter: "fetch",
      signal: controller.signal as any,
      env: env(fetch) as any,
    })
    .catch((e: any) => e);

  assertEquals(faxios.isCancel(err), true);
  assertEquals(err.code, "ERR_CANCELED");
  assertEquals(fetchCallCount, 0);
});

Deno.test("cancel: in-flight abort cancels request", async () => {
  const fetch = async (_input: any, init?: any) =>
    new Promise<Response>((_resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new DOMException("The operation was aborted", "AbortError"));
      }, 20);

      if (init?.signal) {
        if (init.signal.aborted) {
          clearTimeout(timeout);
          reject(new DOMException("The operation was aborted", "AbortError"));
          return;
        }

        init.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            reject(new DOMException("The operation was aborted", "AbortError"));
          },
          { once: true }
        );
      }
    });

  const controller = new AbortController();

  const request = faxios.get("https://example.com/in-flight", {
    adapter: "fetch",
    signal: controller.signal as any,
    env: env(fetch) as any,
  });

  controller.abort();

  const err = await request.catch((e: any) => e);

  assertEquals(faxios.isCancel(err), true);
  assertEquals(err.code, "ERR_CANCELED");
});

Deno.test("cancel: isCancel returns false for plain Error", () => {
  assertEquals(faxios.isCancel(new Error("random")), false);
});
