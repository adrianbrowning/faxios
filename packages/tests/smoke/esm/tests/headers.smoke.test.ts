import faxios from "faxios";
import { describe, expect, it } from "vitest";

const createFetchMock = () => {
  let capturedInput;
  let capturedInit;

  const mockFetch = async (input, init) => {
    capturedInput = input;
    capturedInit = init || {};
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  return {
    mockFetch,
    getCapturedHeaders: () => new Headers(capturedInit.headers ?? {}),
  };
};

describe("headers compat (dist export only)", () => {
  it("sends default Accept header", async () => {
    const { mockFetch, getCapturedHeaders } = createFetchMock();

    await faxios.get("http://example.com/default-headers", {
      env: { fetch: mockFetch, Request, Response },
    });

    expect(getCapturedHeaders().get("accept")).toBe("application/json, text/plain, */*");
  });

  it("supports custom headers", async () => {
    const { mockFetch, getCapturedHeaders } = createFetchMock();

    await faxios.get("http://example.com/custom-headers", {
      env: { fetch: mockFetch, Request, Response },
      headers: {
        "X-Trace-Id": "trace-123",
        Authorization: "Bearer token-abc",
      },
    });

    expect(getCapturedHeaders().get("x-trace-id")).toBe("trace-123");
    expect(getCapturedHeaders().get("authorization")).toBe("Bearer token-abc");
  });

  it("treats header names as case-insensitive when overriding", async () => {
    const { mockFetch, getCapturedHeaders } = createFetchMock();

    await faxios.get("http://example.com/case-insensitive", {
      env: { fetch: mockFetch, Request, Response },
      headers: {
        authorization: "Bearer old-token",
        AuThOrIzAtIoN: "Bearer new-token",
      },
    });

    expect(getCapturedHeaders().get("authorization")).toBe("Bearer new-token");
  });

  it("sets content-type for json post payloads", async () => {
    const { mockFetch, getCapturedHeaders } = createFetchMock();

    await faxios.post(
      "http://example.com/post-json",
      { name: "widget" },
      {
        env: { fetch: mockFetch, Request, Response },
      }
    );

    expect(getCapturedHeaders().get("content-type")).toContain("application/json");
  });

  it("does not force content-type for get requests without body", async () => {
    const { mockFetch, getCapturedHeaders } = createFetchMock();

    await faxios.get("http://example.com/get-no-body", {
      env: { fetch: mockFetch, Request, Response },
    });

    expect(getCapturedHeaders().get("content-type")).toBeNull();
  });
});
