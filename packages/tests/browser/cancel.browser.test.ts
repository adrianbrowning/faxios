import { describe, expect, it } from "vitest";

import faxios from "#src/index.js";
import type { GenericAbortSignal } from "#src/lib/types.js";

import { installFetchMock } from "./helpers/fetchMock.js";

describe("cancel (vitest browser)", () => {
  it("supports cancellation using AbortController signal", async () => {
    using _mock = installFetchMock();
    const controller = new AbortController();
    const promise = faxios.get("/foo/bar", {
      signal: controller.signal as GenericAbortSignal,
    });

    controller.abort();

    const error = await promise.catch((thrown: unknown) => thrown);
    expect(faxios.isCancel(error)).toBe(true);
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
        options?: boolean | AddEventListenerOptions
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
