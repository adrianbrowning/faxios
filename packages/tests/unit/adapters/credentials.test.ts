import assert from "node:assert";
import { describe, it } from "vitest";
import faxios from "#src/index.js";

// The credentials mode the fetch adapter hands to `fetch` for each `withCredentials` value.
const sentCredentials = async (withCredentials?: boolean | string): Promise<unknown> => {
  let credentials: unknown;
  await faxios.get("http://localhost/", {
    ...(withCredentials === undefined ? {} : { withCredentials: withCredentials as boolean }),
    env: {
      fetch: async (_input: unknown, init?: RequestInit) => {
        credentials = init?.credentials;
        return new Response("ok");
      },
    },
  });
  return credentials;
};

describe("fetch adapter withCredentials -> credentials", () => {
  it("sends same-origin cookies when withCredentials is false", async () => {
    assert.strictEqual(await sentCredentials(false), "same-origin");
  });

  it("sends same-origin cookies when withCredentials is unset", async () => {
    assert.strictEqual(await sentCredentials(), "same-origin");
  });

  it("includes cookies cross-origin when withCredentials is true", async () => {
    assert.strictEqual(await sentCredentials(true), "include");
  });

  it("passes a string withCredentials through unchanged", async () => {
    assert.strictEqual(await sentCredentials("omit"), "omit");
  });
});
