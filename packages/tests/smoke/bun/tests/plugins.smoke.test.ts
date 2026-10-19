import { describe, expect, test } from "bun:test";
import faxios, * as root from "faxios";
import * as pluginsEntry from "faxios/plugins";
import { authBearer } from "faxios/plugins/auth-bearer";
import { authenticate } from "faxios/plugins/authenticate";
import { forwardTo } from "faxios/plugins/forward-to";
import { retry } from "faxios/plugins/retry";
import { timing } from "faxios/plugins/timing";
import type { TimingEvent } from "faxios/plugins/timing";
import type { MockFetch } from "./helpers.ts";
import { toRequest } from "./helpers.ts";

describe("plugin subpaths", () => {
  test("faxios/plugins exports only definePlugin, the root no plugin API", () => {
    expect(Object.keys(pluginsEntry)).toEqual([ "definePlugin" ]);
    for (const name of [ "authBearer", "authenticate", "forwardTo", "retry", "timing", "definePlugin" ]) {
      expect(Object.hasOwn(root, name)).toBe(false);
    }
  });

  test("a definePlugin plugin runs with authBearer, retry and timing", async () => {
    const calls: Array<Request> = [];
    const fetch: MockFetch = async (input, init) => {
      calls.push(toRequest(input, init));
      return new Response(null, { status: calls.length === 1 ? 503 : 200 });
    };
    const events: Array<TimingEvent> = [];
    const tagged = pluginsEntry.definePlugin({
      name: "tag",
      middleware: async (ctx, next) => {
        ctx.config.headers.set("X-Tag", "bun");
        return next(ctx);
      },
    });
    const api = faxios.create({ baseURL: "https://example.com", env: { fetch } })
      .use(timing(event => events.push(event)))
      .use(authBearer(() => "bun-token"))
      .use(tagged)
      .use(retry({ attempts: 2, delay: 0 }));

    const response = await api.get("/plugins");

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.headers.get("authorization")).toBe("Bearer bun-token");
    expect(calls[1]!.headers.get("x-tag")).toBe("bun");
    expect(events.map(event => event.status)).toEqual([ 200 ]);
  });

  test("forwardTo sends every try to the gateway with the target URL in X-Forward-To", async () => {
    const calls: Array<Request> = [];
    const fetch: MockFetch = async (input, init) => {
      calls.push(toRequest(input, init));
      return new Response(null, { status: calls.length === 1 ? 503 : 200 });
    };
    const api = faxios.create({ baseURL: "https://api.example.com", env: { fetch } })
      .use(retry({ attempts: 2, delay: 0 }))
      .use(forwardTo("http://gateway.example/"));

    await api.get("/items", { params: { q: "1" } });
    await api.get("/direct", { forward: false });

    expect(calls.map(call => [ call.url, call.headers.get("x-forward-to") ])).toEqual([
      [ "http://gateway.example/", "https://api.example.com/items?q=1" ],
      [ "http://gateway.example/", "https://api.example.com/items?q=1" ],
      [ "https://api.example.com/direct", null ],
    ]);
  });

  test("authenticate sends query and cookie credentials on a server runtime", async () => {
    const calls: Array<Request> = [];
    const fetch: MockFetch = async (input, init) => {
      calls.push(toRequest(input, init));
      return new Response(null, { status: 200 });
    };
    const api = faxios.create({ baseURL: "http://example.com", env: { fetch } })
      .use(authenticate(() => ({ query: { api_key: "q" }, cookies: { session: "s" } })));

    await api.get("/data");

    expect(calls[0].url).toBe("http://example.com/data?api_key=q");
    expect(calls[0].headers.get("cookie")).toBe("session=s");
  });
});
