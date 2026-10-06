import { assertEquals } from "@std/assert";
import faxios, * as root from "faxios";
import * as pluginsEntry from "faxios/plugins";
import { authBearer } from "faxios/plugins/auth-bearer";
import { retry } from "faxios/plugins/retry";
import { timing } from "faxios/plugins/timing";
import type { TimingEvent } from "faxios/plugins/timing";

Deno.test("Deno plugins: faxios/plugins exports only definePlugin, the root no plugin API", () => {
  assertEquals(Object.keys(pluginsEntry), [ "definePlugin" ]);
  for (const name of [ "authBearer", "retry", "timing", "definePlugin" ]) {
    assertEquals(Object.hasOwn(root, name), false);
  }
});

Deno.test("Deno plugins: a definePlugin plugin runs with authBearer, retry and timing", async () => {
  const calls: Array<Request> = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(new Request(input, init));
    return new Response(null, { status: calls.length === 1 ? 503 : 200 });
  };
  const events: Array<TimingEvent> = [];
  const tagged = pluginsEntry.definePlugin({
    name: "tag",
    middleware: async (ctx, next) => {
      ctx.config.headers.set("X-Tag", "deno");
      return next(ctx);
    },
  });
  const api = faxios.create({ baseURL: "https://example.com", env: { fetch } })
    .use(timing(event => events.push(event)))
    .use(authBearer(() => "deno-token"))
    .use(tagged)
    .use(retry({ attempts: 2, delay: 0 }));

  const response = await api.get("/plugins");

  assertEquals(response.status, 200);
  assertEquals(calls.length, 2);
  assertEquals(calls[1]!.headers.get("authorization"), "Bearer deno-token");
  assertEquals(calls[1]!.headers.get("x-tag"), "deno");
  assertEquals(events.map(event => event.status), [ 200 ]);
});
