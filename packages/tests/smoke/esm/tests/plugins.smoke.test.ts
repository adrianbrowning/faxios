import faxios, * as root from "faxios";
import * as plugins from "faxios/plugins";
import { authBearer } from "faxios/plugins/auth-bearer";
import { retry } from "faxios/plugins/retry";
import { timing } from "faxios/plugins/timing";
import { describe, expect, it } from "vitest";

describe("plugin subpaths (dist export only)", () => {
  it("exports the same plugins from the barrel and each subpath, and none from the root", () => {
    expect({ ...plugins }).toEqual({ authBearer, retry, timing });
    for (const name of [ "authBearer", "retry", "timing" ]) {
      expect(Object.hasOwn(root, name)).toBe(false);
    }
    expect(faxios.plugins).toBeUndefined();
    expect(typeof root.definePlugin).toBe("function");
  });

  it("runs authBearer, retry and timing together", async () => {
    const calls = [];
    const fetch = async (input, init) => {
      calls.push(new Request(input, init));
      return new Response(null, { status: calls.length === 1 ? 503 : 200 });
    };
    const events = [];
    const api = faxios.create({ env: { fetch } })
      .use(timing(event => events.push(event)))
      .use(authBearer(() => "smoke-token"))
      .use(retry({ attempts: 2, delay: 0 }));

    const response = await api.get("http://example.com/plugins");

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[1].headers.get("authorization")).toBe("Bearer smoke-token");
    expect(events).toEqual([ expect.objectContaining({ status: 200 }) ]);
  });
});
