import faxios from "faxios";
import { toRequest } from "./helpers.js";
import type { MockFetch } from "./helpers.js";

type Echo = { body: string; contentType: string; path: string; };
import { describe, expect, it } from "vitest";

const createEchoFetch = () => {
  const mockFetch: MockFetch = async (input, init) => {
    const request = toRequest(input, init);
    const url = new URL(request.url);
    const body = await request.text();
    const contentType = request.headers.get("content-type") ?? "";

    return new Response(
      JSON.stringify({ path: url.pathname + url.search, body, contentType }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  return { mockFetch };
};

describe("urlencode compat (dist export only)", () => {
  it("serializes params into request URL", async () => {
    const { mockFetch } = createEchoFetch();

    const response = await faxios.get<Echo>("http://example.com/search", {
      env: { fetch: mockFetch, Request, Response },
      params: { q: "faxios docs", page: 2 },
    });

    expect(response.data.path).toBe("/search?q=faxios+docs&page=2");
  });

  it("supports custom paramsSerializer function", async () => {
    const { mockFetch } = createEchoFetch();

    const response = await faxios.get<Echo>("http://example.com/search", {
      env: { fetch: mockFetch, Request, Response },
      params: { q: "ignored" },
      paramsSerializer: () => "fixed=1",
    });

    expect(response.data.path).toBe("/search?fixed=1");
  });

  it("supports URLSearchParams payloads", async () => {
    const { mockFetch } = createEchoFetch();
    const payload = new URLSearchParams();
    payload.append("name", "faxios");
    payload.append("mode", "compat");

    const response = await faxios.post<Echo>("http://example.com/form", payload, {
      env: { fetch: mockFetch, Request, Response },
    });

    expect(response.data.body).toBe("name=faxios&mode=compat");
    expect(response.data.contentType).toContain("application/x-www-form-urlencoded");
  });

  it("serializes object payload when content-type is application/x-www-form-urlencoded", async () => {
    const { mockFetch } = createEchoFetch();

    const response = await faxios.post<Echo>(
      "http://example.com/form",
      { name: "faxios", mode: "compat" },
      {
        env: { fetch: mockFetch, Request, Response },
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }
    );

    expect(response.data.body).toBe("name=faxios&mode=compat");
    expect(response.data.contentType).toContain("application/x-www-form-urlencoded");
  });

  it("respects formSerializer options for index formatting", async () => {
    const { mockFetch } = createEchoFetch();

    const response = await faxios.post<Echo>(
      "http://example.com/form",
      { arr: [ "1", "2" ] },
      {
        env: { fetch: mockFetch, Request, Response },
        headers: { "content-type": "application/x-www-form-urlencoded" },
        formSerializer: { indexes: true },
      }
    );

    expect(response.data.body).toBe("arr%5B0%5D=1&arr%5B1%5D=2");
  });
});
