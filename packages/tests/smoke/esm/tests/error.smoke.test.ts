import faxios from "faxios";
import { describe, expect, it } from "vitest";

describe("error compat (dist export only)", () => {
  it("rejects with FaxiosError for non-2xx responses by default", async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ error: "boom" }), {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "Content-Type": "application/json" },
      });

    const err = await faxios
      .get("http://example.com/fail", {
        env: { fetch: mockFetch, Request, Response },
      })
      .catch(e => e);

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err.response.status).toBe(500);
    expect(err.message).toContain("500");
  });

  it("resolves when validateStatus allows non-2xx responses", async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ ok: false }), {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "Content-Type": "application/json" },
      });

    const response = await faxios.get("http://example.com/allowed", {
      validateStatus: () => true,
      env: { fetch: mockFetch, Request, Response },
    });

    expect(response.status).toBe(500);
    expect(response.data).toEqual({ ok: false });
  });

  it("wraps transport errors as FaxiosError", async () => {
    const mockFetch = async () => {
      throw new TypeError("socket hang up");
    };

    const err = await faxios
      .get("http://example.com/network", {
        env: { fetch: mockFetch, Request, Response },
      })
      .catch(e => e);

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err.message).toContain("socket hang up");
    expect(err.toJSON).toBeTypeOf("function");
  });

  it("rejects with ETIMEDOUT on timeout", async () => {
    const mockFetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        const { signal } = init || {};
        if (signal?.aborted) { reject(signal.reason); return; }
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });

    const err = await faxios
      .get("http://example.com/timeout", {
        timeout: 10,
        env: { fetch: mockFetch, Request, Response },
      })
      .catch(e => e);

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err.code).toBe("ETIMEDOUT");
    expect(err.message).toBe("timeout of 10ms exceeded");
  });

  it("uses timeoutErrorMessage when provided", async () => {
    const mockFetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        const { signal } = init || {};
        if (signal?.aborted) { reject(signal.reason); return; }
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });

    const err = await faxios
      .get("http://example.com/timeout", {
        timeout: 25,
        timeoutErrorMessage: "custom timeout message",
        env: { fetch: mockFetch, Request, Response },
      })
      .catch(e => e);

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err.code).toBe("ETIMEDOUT");
    expect(err.message).toBe("custom timeout message");
  });
});
