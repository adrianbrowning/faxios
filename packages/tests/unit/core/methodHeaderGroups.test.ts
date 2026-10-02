import { describe, it, expect } from "vitest";
import faxios from "#src/index.ts";
import type { FaxiosConfigHeaders } from "#src/index.ts";

const GROUPS = [ "common", "delete", "get", "head", "options", "post", "put", "patch", "purge", "link", "unlink", "query" ] as const;

function captureHeaders() {
  const seen: { headers: Headers | undefined; } = { headers: undefined };
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    seen.headers = input instanceof Request ? input.headers : new Headers(init?.headers);
    return new Response("{}", { headers: { "Content-Type": "application/json" } });
  };
  return { seen, fetch };
}

describe("method header groups", () => {
  const headers: FaxiosConfigHeaders = Object.fromEntries(GROUPS.map(group => [ group, { [`X-${group}`]: group }]));

  it.each([ "get", "options", "purge", "link", "unlink" ] as const)("%s: applies common and its own group, sends no group name as a header", async method => {
    const { seen, fetch } = captureHeaders();

    await faxios.request({ url: "http://example.test/", method, headers, env: { fetch } });

    const sent = seen.headers!;
    for (const group of GROUPS) {
      expect(sent.has(group), `group "${group}" leaked as a header`).toBe(false);
    }
    expect(sent.get("X-common")).toBe("common");
    expect(sent.get(`X-${method}`)).toBe(method);
    const otherGroups = GROUPS.filter(group => group !== "common" && group !== method);
    for (const group of otherGroups) {
      expect(sent.has(`X-${group}`), `group "${group}" applied to a ${method} request`).toBe(false);
    }
  });

  it("strips groups declared on instance defaults", async () => {
    const { seen, fetch } = captureHeaders();
    const instance = faxios.create({ headers: { options: { "X-Opt": "o" }, link: { "X-Link": "l" } } });

    await instance.get("http://example.test/", { env: { fetch } });

    expect(seen.headers!.has("options")).toBe(false);
    expect(seen.headers!.has("link")).toBe(false);
    expect(seen.headers!.has("X-Opt")).toBe(false);
  });
});
