import { EventEmitter } from "node:events";
import faxios from "faxios";
import { describe, expect, it } from "vitest";

const createPendingTransport = () => {
  let requestCount = 0;

  const transport = {
    request() {
      requestCount += 1;

      const req = new EventEmitter();
      req.destroyed = false;
      req.setTimeout = () => {};
      req.write = () => true;
      req.end = () => {};
      req.destroy = () => {
        req.destroyed = true;
      };
      req.close = req.destroy;

      return req;
    },
  };

  return {
    transport,
    getRequestCount: () => requestCount,
  };
};

describe("cancel compat (dist export only)", () => {
  it("supports cancellation with AbortController (pre-aborted signal)", async () => {
    const { transport, getRequestCount } = createPendingTransport();
    const controller = new AbortController();
    controller.abort();

    try {
      const request = faxios.get("http://example.com/resource", {
        signal: controller.signal,
        transport,
        proxy: false,
      });

      controller.abort();
      await request;
    }
    catch (error) {
      expect(error.code).toBe("ERR_CANCELED");
    }

    expect(getRequestCount()).toBe(0);
  });

  it("supports cancellation with AbortController (in-flight)", async () => {
    const { transport, getRequestCount } = createPendingTransport();
    const controller = new AbortController();

    try {
      const request = faxios.get("http://example.com/resource", {
        signal: controller.signal,
        transport,
        proxy: false,
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
    const { transport, getRequestCount } = createPendingTransport();
    const source = faxios.CancelToken.source();
    source.cancel("Operation canceled by the user.");

    const error = await faxios
      .get("http://example.com/resource", {
        cancelToken: source.token,
        transport,
        proxy: false,
      })
      .catch(err => err);

    expect(faxios.isCancel(error)).toBe(true);
    expect(error.code).toBe("ERR_CANCELED");
    expect(getRequestCount()).toBe(0);
  });

  it("supports cancellation with CancelToken (in-flight)", async () => {
    const { transport, getRequestCount } = createPendingTransport();
    const source = faxios.CancelToken.source();

    const request = faxios.get("http://example.com/resource", {
      cancelToken: source.token,
      transport,
      proxy: false,
    });

    source.cancel("Operation canceled by the user.");

    const error = await request.catch(err => err);

    expect(faxios.isCancel(error)).toBe(true);
    expect(error.code).toBe("ERR_CANCELED");
    expect(getRequestCount()).toBe(1);
  });
});
