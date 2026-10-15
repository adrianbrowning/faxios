import faxios from "faxios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pendingFetch } from "./helpers.js";

const hangingFetch = pendingFetch;

describe("timeout compat (dist export only)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects with ETIMEDOUT on timeout", async () => {
    const pending = faxios
      .get("http://example.com/timeout", {
        timeout: 25,
        env: { fetch: hangingFetch, Request, Response },
      })
      .catch(e => e);
    await vi.advanceTimersByTimeAsync(25);
    const err = await pending;

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err.code).toBe("ETIMEDOUT");
    expect(err.message).toBe("timeout of 25ms exceeded");
  });

  it("uses timeoutErrorMessage when provided", async () => {
    const pending = faxios
      .get("http://example.com/timeout", {
        timeout: 25,
        timeoutErrorMessage: "custom timeout",
        env: { fetch: hangingFetch, Request, Response },
      })
      .catch(e => e);
    await vi.advanceTimersByTimeAsync(25);
    const err = await pending;

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err.code).toBe("ETIMEDOUT");
    expect(err.message).toBe("custom timeout");
  });

  // Wrapped: it.each spreads an array case into arguments, so a bare `[]` would arrive as undefined.
  it.each([{ timeout: "30" }, { timeout: true }, { timeout: " " }, { timeout: [] }, { timeout: { invalid: true } }])("rejects a timeout that isn't a number ($timeout)", async ({ timeout }) => {
    const err = await faxios
      .get("http://example.com/timeout", {
        // @ts-expect-error TS2769 -- untyped JS callers may pass anything; the runtime must reject it
        timeout,
        env: { fetch: hangingFetch, Request, Response },
      })
      .catch(e => e);

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err.code).toBe("ERR_BAD_OPTION_VALUE");
    expect(err.message).toBe("`config.timeout` must be a finite number of milliseconds");
  });

  it("does not time out when timeout is 0", async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const response = await faxios.get("http://example.com/no-timeout", {
      timeout: 0,
      env: { fetch: mockFetch, Request, Response },
    });

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ ok: true });
  });
});
