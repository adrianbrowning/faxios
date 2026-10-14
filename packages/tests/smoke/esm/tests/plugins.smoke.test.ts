import faxios, * as root from "faxios";
import * as pluginsEntry from "faxios/plugins";
import { authBearer } from "faxios/plugins/auth-bearer";
import { forwardTo } from "faxios/plugins/forward-to";
import { retry } from "faxios/plugins/retry";
import { timing } from "faxios/plugins/timing";
import { describe, expect, it } from "vitest";
import type { MockFetch } from "./helpers.js";

describe("plugin subpaths (dist export only)", () => {
  it("exports definePlugin only from faxios/plugins, and no plugin API from the root", () => {
    expect(Object.keys(pluginsEntry)).toEqual([ "definePlugin" ]);
    for (const name of [ "authBearer", "forwardTo", "retry", "timing", "definePlugin" ]) {
      expect(Object.hasOwn(root, name)).toBe(false);
    }
    expect(Reflect.get(faxios, "plugins")).toBeUndefined();
  });

  it("runs a definePlugin plugin with authBearer, retry and timing", async () => {
    const calls: Array<Request> = [];
    const fetch: MockFetch = async (input, init) => {
      calls.push(new Request(input, init));
      return new Response(null, { status: calls.length === 1 ? 503 : 200 });
    };
    const events: Array<unknown> = [];
    const tagged = pluginsEntry.definePlugin({
      name: "tag",
      middleware: async (ctx, next) => {
        ctx.config.headers.set("X-Tag", "smoke");
        return next(ctx);
      },
    });
    // authBearer sends the token to the instance baseURL's origin, never to a per-request one.
    const api = faxios.create({ baseURL: "http://example.com", env: { fetch } })
      .use(timing(event => events.push(event)))
      .use(authBearer(() => "smoke-token"))
      .use(tagged)
      .use(retry({ attempts: 2, delay: 0 }));

    const response = await api.get("/plugins");

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[1].headers.get("authorization")).toBe("Bearer smoke-token");
    expect(calls[1].headers.get("x-tag")).toBe("smoke");
    expect(events).toEqual([ expect.objectContaining({ status: 200 }) ]);
  });

  it("forwards every try to the gateway with the target URL in X-Forward-To", async () => {
    const calls: Array<Request> = [];
    const fetch: MockFetch = async (input, init) => {
      calls.push(new Request(input, init));
      return new Response(null, { status: calls.length === 1 ? 503 : 200 });
    };
    const api = faxios.create({ baseURL: "https://api.example.com", env: { fetch } })
      .use(retry({ attempts: 2, delay: 0 }))
      .use(forwardTo("http://gateway.example/"));

    await api.get("/items", { params: { q: "1" } });

    expect(calls.map(call => [ call.url, call.headers.get("x-forward-to") ])).toEqual([
      [ "http://gateway.example/", "https://api.example.com/items?q=1" ],
      [ "http://gateway.example/", "https://api.example.com/items?q=1" ],
    ]);
  });
});
