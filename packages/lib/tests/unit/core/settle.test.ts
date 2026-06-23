import { describe, it, expect, vi } from "vitest";
import AxiosError from "../../../src/lib/core/AxiosError.js";
import settle from "../../../src/lib/core/settle.js";
import type { AxiosResponse } from "../../../src/lib/types.js";

function makeResponse(
  status: number,
  validateStatus: ((s: number) => boolean) | null = (s) => s >= 200 && s < 300,
): AxiosResponse {
  return {
    status,
    statusText: "",
    config: { validateStatus } as AxiosResponse["config"],
    request: {},
    data: null,
    headers: {},
  };
}

describe("core::settle", () => {
  describe("resolves the promise", () => {
    it("resolves for a 200 status by default", () => {
      const resolve = vi.fn();
      const reject = vi.fn();
      settle(resolve, reject, makeResponse(200));
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(reject).not.toHaveBeenCalled();
    });

    it("resolves when validateStatus is not provided", () => {
      const resolve = vi.fn();
      const reject = vi.fn();
      const response = makeResponse(500);
      response.config.validateStatus = null;
      settle(resolve, reject, response);
      expect(resolve).toHaveBeenCalledTimes(1);
    });

    it("resolves when status is 0 (no response, e.g. network error)", () => {
      const resolve = vi.fn();
      const reject = vi.fn();
      const response = makeResponse(0);
      settle(resolve, reject, response);
      expect(resolve).toHaveBeenCalledTimes(1);
    });
  });

  describe("error code assignment", () => {
    it("assigns ERR_BAD_REQUEST for a 400 status", () => {
      const resolve = vi.fn();
      const reject = vi.fn();
      settle(
        resolve,
        reject,
        makeResponse(400, () => false),
      );
      expect(reject).toHaveBeenCalledTimes(1);
      const error = reject.mock.calls[0]![0];
      expect(error).toBeInstanceOf(AxiosError);
      expect(error.code).toBe(AxiosError.ERR_BAD_REQUEST);
    });

    it("assigns ERR_BAD_REQUEST for a 404 status", () => {
      const resolve = vi.fn();
      const reject = vi.fn();
      settle(
        resolve,
        reject,
        makeResponse(404, () => false),
      );
      const error = reject.mock.calls[0]![0];
      expect(error.code).toBe(AxiosError.ERR_BAD_REQUEST);
    });

    it("assigns ERR_BAD_REQUEST for a 499 status (top of 4xx range)", () => {
      const resolve = vi.fn();
      const reject = vi.fn();
      settle(
        resolve,
        reject,
        makeResponse(499, () => false),
      );
      const error = reject.mock.calls[0]![0];
      expect(error.code).toBe(AxiosError.ERR_BAD_REQUEST);
    });

    it("assigns ERR_BAD_RESPONSE for a 500 status", () => {
      const resolve = vi.fn();
      const reject = vi.fn();
      settle(
        resolve,
        reject,
        makeResponse(500, () => false),
      );
      const error = reject.mock.calls[0]![0];
      expect(error.code).toBe(AxiosError.ERR_BAD_RESPONSE);
    });

    it("assigns ERR_BAD_RESPONSE for a 503 status", () => {
      const resolve = vi.fn();
      const reject = vi.fn();
      settle(
        resolve,
        reject,
        makeResponse(503, () => false),
      );
      const error = reject.mock.calls[0]![0];
      expect(error.code).toBe(AxiosError.ERR_BAD_RESPONSE);
    });

    // A custom validateStatus can reject any status — including 1xx, 2xx, 3xx,
    // or ≥ 600 — and the resulting AxiosError must always have a defined code.
    it("assigns ERR_BAD_RESPONSE for a 3xx status rejected via custom validateStatus", () => {
      const resolve = vi.fn();
      const reject = vi.fn();
      settle(
        resolve,
        reject,
        makeResponse(301, () => false),
      );
      const error = reject.mock.calls[0]![0];
      expect(error.code).toBeDefined();
      expect(error.code).toBe(AxiosError.ERR_BAD_RESPONSE);
    });

    it("assigns ERR_BAD_RESPONSE for a 2xx status rejected via custom validateStatus", () => {
      const resolve = vi.fn();
      const reject = vi.fn();
      settle(
        resolve,
        reject,
        makeResponse(200, () => false),
      );
      const error = reject.mock.calls[0]![0];
      expect(error.code).toBeDefined();
      expect(error.code).toBe(AxiosError.ERR_BAD_RESPONSE);
    });

    it("assigns ERR_BAD_RESPONSE for a 6xx status rejected via custom validateStatus", () => {
      const resolve = vi.fn();
      const reject = vi.fn();
      settle(
        resolve,
        reject,
        makeResponse(600, () => false),
      );
      const error = reject.mock.calls[0]![0];
      expect(error.code).toBeDefined();
      expect(error.code).toBe(AxiosError.ERR_BAD_RESPONSE);
    });
  });

  describe("error message", () => {
    it("includes the status code in the error message", () => {
      const resolve = vi.fn();
      const reject = vi.fn();
      settle(
        resolve,
        reject,
        makeResponse(404, () => false),
      );
      const error = reject.mock.calls[0]![0];
      expect(error.message).toBe("Request failed with status code 404");
    });
  });
});
