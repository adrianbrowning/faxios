import faxios from "faxios";
import { describe, expect, it } from "vitest";

const hangingFetch = async (_input, init) =>
  new Promise((_resolve, reject) => {
    const { signal } = init || {};
    if (signal?.aborted) { reject(signal.reason); return; }
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });

describe("timeout compat (dist export only)", () => {
  it("rejects with ETIMEDOUT on timeout", async () => {
    const err = await faxios
      .get("http://example.com/timeout", {
        timeout: 25,
        env: { fetch: hangingFetch, Request, Response },
      })
      .catch(e => e);

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err.code).toBe("ETIMEDOUT");
    expect(err.message).toBe("timeout of 25ms exceeded");
  });

  it("uses timeoutErrorMessage when provided", async () => {
    const err = await faxios
      .get("http://example.com/timeout", {
        timeout: 25,
        timeoutErrorMessage: "custom timeout",
        env: { fetch: hangingFetch, Request, Response },
      })
      .catch(e => e);

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err.code).toBe("ETIMEDOUT");
    expect(err.message).toBe("custom timeout");
  });

  it("accepts timeout as a numeric string", async () => {
    const err = await faxios
      .get("http://example.com/timeout", {
        timeout: "30",
        env: { fetch: hangingFetch, Request, Response },
      })
      .catch(e => e);

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err.code).toBe("ETIMEDOUT");
    expect(err.message).toBe("timeout of 30ms exceeded");
  });

  it("rejects with ERR_BAD_OPTION_VALUE when timeout is not parsable", async () => {
    const err = await faxios
      .get("http://example.com/timeout", {
        timeout: { invalid: true },
        env: { fetch: hangingFetch, Request, Response },
      })
      .catch(e => e);

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err.code).toBe("ERR_BAD_OPTION_VALUE");
    expect(err.message).toBe("error trying to parse `config.timeout` to int");
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
