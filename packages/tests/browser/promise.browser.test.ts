import { describe, expect, it } from "vitest";

import faxios from "#src/index.js";

import { installFetchMock } from "./helpers/fetchMock.js";

describe("promise (vitest browser)", () => {
  it("should provide succinct object to then", async () => {
    using _mock = installFetchMock();
    _mock.respondWith({
      body: "{\"hello\":\"world\"}",
      headers: { "Content-Type": "application/json" },
    });

    const response = await faxios("/foo");

    expect(typeof response).toBe("object");
    expect((response.data as Record<string, string>).hello).toBe("world");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json");
    expect(response.config.url).toBe("/foo");
  });

  it("should support all", async () => {
    const result = await faxios.all([ true, 123 ] as unknown as Array<
      Promise<unknown>
    >);

    expect(result).toEqual([ true, 123 ]);
  });

  it("should support spread", async () => {
    let fulfilled = false;
    const result = await faxios
      .all([ 123, 456 ] as unknown as Array<Promise<unknown>>)
      .then(
        faxios.spread((...args: Array<unknown>) => {
          const [ a, b ] = args as [number, number];
          expect(a + b).toBe(123 + 456);
          fulfilled = true;
          return "hello world";
        })
      );

    expect(fulfilled).toBe(true);
    expect(result).toBe("hello world");
  });
});
