import { describe, expect, it, vi } from "vitest";

import AxiosError from "../../../lib/src/lib/core/AxiosError.js";
import settle from "../../../lib/src/lib/core/settle.js";
import type { AxiosResponse } from "../../../lib/src/lib/types.js";

describe("core::settle (vitest browser)", () => {
  it("resolves when response status is missing", () => {
    const resolve = vi.fn();
    const reject = vi.fn();
    const response = {
      config: {
        validateStatus: () => true,
      },
    } as unknown as AxiosResponse;

    settle(resolve, reject, response);

    expect(resolve).toHaveBeenCalledExactlyOnceWith(response);
    expect(reject).not.toHaveBeenCalled();
  });

  it("resolves when validateStatus is not configured", () => {
    const resolve = vi.fn();
    const reject = vi.fn();
    const response = {
      status: 500,
      config: {},
    } as unknown as AxiosResponse;

    settle(resolve, reject, response);

    expect(resolve).toHaveBeenCalledExactlyOnceWith(response);
    expect(reject).not.toHaveBeenCalled();
  });

  it("resolves when validateStatus returns true", () => {
    const resolve = vi.fn();
    const reject = vi.fn();
    const response = {
      status: 500,
      config: {
        validateStatus: () => true,
      },
    } as unknown as AxiosResponse;

    settle(resolve, reject, response);

    expect(resolve).toHaveBeenCalledExactlyOnceWith(response);
    expect(reject).not.toHaveBeenCalled();
  });

  it("rejects with an AxiosError when validateStatus returns false", () => {
    const resolve = vi.fn();
    const reject = vi.fn();
    const request = {
      path: "/foo",
    };
    const response = {
      status: 500,
      config: {
        validateStatus: () => false,
      },
      request,
    } as unknown as AxiosResponse;

    settle(resolve, reject, response);

    expect(resolve).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledOnce();

    const reason = reject.mock.calls[0]![0];
    expect(reason).toBeInstanceOf(AxiosError);
    expect(reason.message).toBe("Request failed with status code 500");
    expect(reason.code).toBe(AxiosError.ERR_BAD_RESPONSE);
    expect(reason.config).toBe(response.config);
    expect(reason.request).toBe(request);
    expect(reason.response).toBe(response);
  });

  it("passes response status to validateStatus", () => {
    const resolve = vi.fn();
    const reject = vi.fn();
    const validateStatus = vi.fn();
    const response = {
      status: 500,
      config: {
        validateStatus,
      },
    } as unknown as AxiosResponse;

    settle(resolve, reject, response);

    expect(validateStatus).toHaveBeenCalledExactlyOnceWith(500);
  });
});
