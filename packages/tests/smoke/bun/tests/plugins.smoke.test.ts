import { describe, expect, test } from "bun:test";
import faxios, * as root from "faxios";
import * as pluginsEntry from "faxios/plugins";
import { authBearer } from "faxios/plugins/auth-bearer";
import { retry } from "faxios/plugins/retry";
import { timing } from "faxios/plugins/timing";
import type { TimingEvent } from "faxios/plugins/timing";

describe("plugin subpaths", () => {
  test("faxios/plugins exports only definePlugin, the root no plugin API", () => {
    expect(Object.keys(pluginsEntry)).toEqual([ "definePlugin" ]);
    for (const name of [ "authBearer", "retry", "timing", "definePlugin" ]) {
      expect(Object.hasOwn(root, name)).toBe(false);
    }
  });

  test("a definePlugin plugin runs with authBearer, retry and timing", async () => {
    const calls: Array<Request> = [];
    const fetch = async (input: unknown, init?: RequestInit) => {
      calls.push(new Request(input as string, init));
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
});
