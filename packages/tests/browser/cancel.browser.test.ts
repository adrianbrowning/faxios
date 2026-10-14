import { describe, expect, it } from "vitest";

import faxios from "#src/index.js";
import type { GenericAbortSignal } from "#src/lib/types.js";

import { installFetchMock } from "./helpers/fetchMock.js";

describe("cancel (vitest browser)", () => {
  it("cancels an in-flight request using AbortController signal", async () => {
    const controller = new AbortController();
    const { promise: sent, resolve: send } = Promise.withResolvers<AbortSignal>();
    const fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init!.signal!;
      send(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    };
    const promise = faxios.get("/foo/bar", {
      signal: controller.signal as GenericAbortSignal,
      env: { fetch },
    });

    // Abort once fetch has the request, so the abort has to reach the fetch itself.
    const fetchSignal = await sent;
    controller.abort();

    const error = await promise.catch((thrown: unknown) => thrown);
    expect(faxios.isCancel(error)).toBe(true);
    expect(fetchSignal.aborted).toBe(true);
  });

  describe("listener cleanup on error paths", () => {
    it("removes AbortSignal listener after network error", async () => {
      using mock = installFetchMock();
      mock.failNetworkError();

      const controller = new AbortController();
      let listenerCount = 0;
      const nativeAdd = controller.signal.addEventListener.bind(
        controller.signal
      );
      const nativeRemove = controller.signal.removeEventListener.bind(
        controller.signal
      );
      controller.signal.addEventListener = (
        type: string,
        fn: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean
      ) => {
        if (type === "abort") listenerCount++;
        return nativeAdd(type, fn, options);
      };
      controller.signal.removeEventListener = (
        type: string,
        fn: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions
      ) => {
        if (type === "abort") listenerCount--;
        return nativeRemove(type, fn, options);
      };

      await faxios
        .get("/foo/bar", { signal: controller.signal as GenericAbortSignal })
        .catch((thrown: unknown) => thrown);

      expect(listenerCount).toBe(0);
    });
  });
});
