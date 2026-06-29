import { describe, expect, it } from "vitest";

import faxios from "#src/index.js";
import type { GenericAbortSignal } from "#src/lib/types.js";

import { installFetchMock } from "./helpers/fetchMock.js";

describe("cancel (vitest browser)", () => {
  describe("when called before sending request", () => {
    it("rejects Promise with a CanceledError object", async () => {
      using mock = installFetchMock();
      const source = faxios.CancelToken.source();
      source.cancel("Operation has been canceled.");

      const error = await faxios
        .get("/foo", { cancelToken: source.token })
        .catch((thrown: unknown) => thrown);

      expect(faxios.isCancel(error)).toBe(true);
      expect((error as Error).message).toBe("Operation has been canceled.");
      expect(mock.requests).toHaveLength(0);
    });
  });

  describe("when called after request has been sent", () => {
    it("rejects Promise with a CanceledError object", async () => {
      using _mock = installFetchMock();
      const source = faxios.CancelToken.source();
      const promise = faxios.get("/foo/bar", { cancelToken: source.token });

      source.cancel("Operation has been canceled.");

      const error = await promise.catch((thrown: unknown) => thrown);

      expect(faxios.isCancel(error)).toBe(true);
      expect((error as Error).message).toBe("Operation has been canceled.");
    });

    it("rejects the promise as canceled when aborted in-flight", async () => {
      using _mock = installFetchMock();
      const source = faxios.CancelToken.source();
      const promise = faxios.get("/foo/bar", { cancelToken: source.token });

      source.cancel();

      const error = await promise.catch((thrown: unknown) => thrown);

      expect(faxios.isCancel(error)).toBe(true);
    });
  });

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
    it("unsubscribes cancelToken listener after network error", async () => {
      using mock = installFetchMock();
      mock.failNetworkError();

      const source = faxios.CancelToken.source();
      await faxios
        .get("/foo/bar", { cancelToken: source.token })
        .catch((thrown: unknown) => thrown);

      expect(source.token._listeners || []).toEqual([]);
    });

    it("unsubscribes cancelToken listener after cancellation", async () => {
      using _mock = installFetchMock();
      const source = faxios.CancelToken.source();
      const promise = faxios
        .get("/foo/bar", { cancelToken: source.token })
        .catch((thrown: unknown) => thrown);

      source.cancel();
      await promise;

      expect(source.token._listeners || []).toEqual([]);
    });

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
