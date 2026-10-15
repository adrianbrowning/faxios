import faxios from "faxios";
import { describe, expect, it } from "vitest";
import { pendingFetch } from "./helpers.js";
import type { MockFetch } from "./helpers.js";

const createPendingFetch = () => {
  let requestCount = 0;

  const mockFetch: MockFetch = async (input, init) => {
    requestCount++;
    return pendingFetch(input, init);
  };

  return { mockFetch, getRequestCount: () => requestCount };
};

describe("cancel compat (dist export only)", () => {
  it("supports cancellation with AbortController (pre-aborted signal)", async () => {
    const { mockFetch, getRequestCount } = createPendingFetch();
    const controller = new AbortController();
    controller.abort();

    const request = faxios.get("http://example.com/resource", {
      signal: controller.signal,
      env: { fetch: mockFetch, Request, Response },
    });

    await expect(request).rejects.toMatchObject({ code: "ERR_CANCELED" });
    expect(getRequestCount()).toBe(0);
  });

  it("supports cancellation with AbortController (in-flight)", async () => {
    const { mockFetch, getRequestCount } = createPendingFetch();
    const controller = new AbortController();

    const request = faxios.get("http://example.com/resource", {
      signal: controller.signal,
      env: { fetch: mockFetch, Request, Response },
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({ code: "ERR_CANCELED" });
    expect(getRequestCount()).toBe(1);
  });
});
