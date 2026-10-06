import faxios, * as root from "faxios";
import * as pluginsEntry from "faxios/plugins";
import { authBearer } from "faxios/plugins/auth-bearer";
import { retry } from "faxios/plugins/retry";
import { timing } from "faxios/plugins/timing";
import { describe, expect, it } from "vitest";

describe("plugin subpaths (dist export only)", () => {
  it("exports definePlugin only from faxios/plugins, and no plugin API from the root", () => {
    expect(Object.keys(pluginsEntry)).toEqual([ "definePlugin" ]);
    for (const name of [ "authBearer", "retry", "timing", "definePlugin" ]) {
      expect(Object.hasOwn(root, name)).toBe(false);
    }
    expect(faxios.plugins).toBeUndefined();
  });

  it("runs a definePlugin plugin with authBearer, retry and timing", async () => {
    const calls = [];
    const fetch = async (input, init) => {
      calls.push(new Request(input, init));
      return new Response(null, { status: calls.length === 1 ? 503 : 200 });
    };
    const events = [];
    const tagged = pluginsEntry.definePlugin({
      name: "tag",
      middleware: async (ctx, next) => {
        ctx.config.headers.set("X-Tag", "smoke");
        return next(ctx);
      },
    });
    const api = faxios.create({ env: { fetch } })
      .use(timing(event => events.push(event)))
      .use(authBearer(() => "smoke-token"))
      .use(tagged)
      .use(retry({ attempts: 2, delay: 0 }));

    const response = await api.get("/plugins", { baseURL: "http://example.com" });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[1].headers.get("authorization")).toBe("Bearer smoke-token");
    expect(calls[1].headers.get("x-tag")).toBe("smoke");
    expect(events).toEqual([ expect.objectContaining({ status: 200 }) ]);
  });
});
