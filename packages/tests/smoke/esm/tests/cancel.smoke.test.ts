import faxios from "faxios";
import { describe, expect, it } from "vitest";

const createPendingFetch = () => {
  let requestCount = 0;

  const mockFetch = async (_input, init) => {
    requestCount++;
    return new Promise((_resolve, reject) => {
      const { signal } = init || {};
      if (signal?.aborted) { reject(signal.reason); return; }
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  };

  return { mockFetch, getRequestCount: () => requestCount };
};

describe("cancel compat (dist export only)", () => {
  it("supports cancellation with AbortController (pre-aborted signal)", async () => {
    const { mockFetch, getRequestCount } = createPendingFetch();
    const controller = new AbortController();
    controller.abort();

    try {
      await faxios.get("http://example.com/resource", {
        signal: controller.signal,
        env: { fetch: mockFetch, Request, Response },
      });
    }
    catch (error) {
      expect(error.code).toBe("ERR_CANCELED");
    }

    expect(getRequestCount()).toBe(0);
  });

  it("supports cancellation with AbortController (in-flight)", async () => {
    const { mockFetch, getRequestCount } = createPendingFetch();
    const controller = new AbortController();

    try {
      const request = faxios.get("http://example.com/resource", {
        signal: controller.signal,
        env: { fetch: mockFetch, Request, Response },
      });

      controller.abort();
      await request;
    }
    catch (error) {
      expect(error.code).toBe("ERR_CANCELED");
    }

    expect(getRequestCount()).toBe(1);
  });

  it("supports cancellation with CancelToken (pre-canceled token)", async () => {
    const { mockFetch, getRequestCount } = createPendingFetch();
    const source = faxios.CancelToken.source();
    source.cancel("Operation canceled by the user.");

    const error = await faxios
      .get("http://example.com/resource", {
        cancelToken: source.token,
        env: { fetch: mockFetch, Request, Response },
      })
      .catch(err => err);

    expect(faxios.isCancel(error)).toBe(true);
    expect(error.code).toBe("ERR_CANCELED");
    expect(getRequestCount()).toBe(0);
  });

  it("supports cancellation with CancelToken (in-flight)", async () => {
    const { mockFetch, getRequestCount } = createPendingFetch();
    const source = faxios.CancelToken.source();

    const request = faxios
      .get("http://example.com/resource", {
        cancelToken: source.token,
        env: { fetch: mockFetch, Request, Response },
      })
      .catch(err => err);

    source.cancel("Operation canceled by the user.");

    const error = await request;

    expect(faxios.isCancel(error)).toBe(true);
    expect(error.code).toBe("ERR_CANCELED");
    expect(getRequestCount()).toBe(1);
  });
});
