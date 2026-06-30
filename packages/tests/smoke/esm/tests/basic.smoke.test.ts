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
    getCaptured: () => ({ input: capturedInput, init: capturedInit }),
  };
};

const runRequest = async run => {
  const { mockFetch, getCaptured } = createFetchMock();
  await run(mockFetch);
  return getCaptured();
};

describe("basic compat (dist export only)", () => {
  it("supports the simplest faxios(url) request pattern", async () => {
    const { input, init } = await runRequest(mockFetch =>
      faxios("http://example.com/users", {
        env: { fetch: mockFetch, Request, Response },
      })
    );

    expect(init.method).toBe("GET");
    expect(new URL(input.url).pathname).toBe("/users");
  });

  it("supports get()", async () => {
    const { input, init } = await runRequest(mockFetch =>
      faxios.get("http://example.com/items?limit=10", {
        env: { fetch: mockFetch, Request, Response },
      })
    );

    expect(init.method).toBe("GET");
    expect(new URL(input.url).pathname + new URL(input.url).search).toBe("/items?limit=10");
  });

  it("supports delete()", async () => {
    const { input, init } = await runRequest(mockFetch =>
      faxios.delete("http://example.com/items/1", {
        env: { fetch: mockFetch, Request, Response },
      })
    );

    expect(init.method).toBe("DELETE");
    expect(new URL(input.url).pathname).toBe("/items/1");
  });

  it("supports head()", async () => {
    const { input, init } = await runRequest(mockFetch =>
      faxios.head("http://example.com/health", {
        env: { fetch: mockFetch, Request, Response },
      })
    );

    expect(init.method).toBe("HEAD");
    expect(new URL(input.url).pathname).toBe("/health");
  });

  it("supports options()", async () => {
    const { input, init } = await runRequest(mockFetch =>
      faxios.options("http://example.com/items", {
        env: { fetch: mockFetch, Request, Response },
      })
    );

    expect(init.method).toBe("OPTIONS");
    expect(new URL(input.url).pathname).toBe("/items");
  });

  it("supports post()", async () => {
    const { input, init } = await runRequest(mockFetch =>
      faxios.post(
        "http://example.com/items",
        { name: "widget" },
        {
          env: { fetch: mockFetch, Request, Response },
        }
      )
    );

    expect(init.method).toBe("POST");
    expect(new URL(input.url).pathname).toBe("/items");
  });

  it("supports put()", async () => {
    const { input, init } = await runRequest(mockFetch =>
      faxios.put(
        "http://example.com/items/1",
        { name: "updated-widget" },
        {
          env: { fetch: mockFetch, Request, Response },
        }
      )
    );

    expect(init.method).toBe("PUT");
    expect(new URL(input.url).pathname).toBe("/items/1");
  });

  it("supports patch()", async () => {
    const { input, init } = await runRequest(mockFetch =>
      faxios.patch(
        "http://example.com/items/1",
        { status: "active" },
        {
          env: { fetch: mockFetch, Request, Response },
        }
      )
    );

    expect(init.method).toBe("PATCH");
    expect(new URL(input.url).pathname).toBe("/items/1");
  });
});
