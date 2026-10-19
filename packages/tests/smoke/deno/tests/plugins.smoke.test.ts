import { assertEquals } from "@std/assert";
import faxios, * as root from "faxios";
import * as pluginsEntry from "faxios/plugins";
import { authBearer } from "faxios/plugins/auth-bearer";
import { authenticate } from "faxios/plugins/authenticate";
import { forwardTo } from "faxios/plugins/forward-to";
import { refreshAuth } from "faxios/plugins/refresh-auth";
import { retry } from "faxios/plugins/retry";
import { timing } from "faxios/plugins/timing";
import type { TimingEvent } from "faxios/plugins/timing";

Deno.test("Deno plugins: faxios/plugins exports only definePlugin, the root no plugin API", () => {
  assertEquals(Object.keys(pluginsEntry), [ "definePlugin" ]);
  for (const name of [ "authBearer", "authenticate", "forwardTo", "refreshAuth", "retry", "timing", "definePlugin" ]) {
    assertEquals(Object.hasOwn(root, name), false);
  }
});

Deno.test("Deno plugins: a definePlugin plugin runs with authBearer, retry and timing", async () => {
  const calls: Array<Request> = [];
  const fetch = async (input: Request | string | URL, init?: RequestInit) => {
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

Deno.test("Deno plugins: forwardTo sends every try to the gateway with the target URL in X-Forward-To", async () => {
  const calls: Array<Request> = [];
  const fetch = async (input: Request | string | URL, init?: RequestInit) => {
    calls.push(new Request(input, init));
    return new Response(null, { status: calls.length === 1 ? 503 : 200 });
  };
  const api = faxios.create({ baseURL: "https://api.example.com", env: { fetch } })
    .use(retry({ attempts: 2, delay: 0 }))
    .use(forwardTo("http://gateway.example/"));

  await api.get("/items", { params: { q: "1" } });
  await api.get("/direct", { forward: false });

  assertEquals(calls.map(call => [ call.url, call.headers.get("x-forward-to") ]), [
    [ "http://gateway.example/", "https://api.example.com/items?q=1" ],
    [ "http://gateway.example/", "https://api.example.com/items?q=1" ],
    [ "https://api.example.com/direct", null ],
  ]);
});

Deno.test("Deno plugins: refreshAuth refreshes authenticate's query and cookie credentials after a 401 on a server runtime", async () => {
  const calls: Array<Request> = [];
  const fetch = async (input: Request | string | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push(request);
    return new Response(null, { status: request.url.endsWith("api_key=new") ? 200 : 401 });
  };
  let key = "old";
  const api = faxios.create({ baseURL: "http://example.com", env: { fetch } })
    .use(refreshAuth(() => {
      key = "new";
    }))
    .use(authenticate(() => ({ query: { api_key: key }, cookies: { session: "s" } })));

  assertEquals((await api.get("/data")).status, 200);

  assertEquals(calls.map(call => call.url), [ "http://example.com/data?api_key=old", "http://example.com/data?api_key=new" ]);
  assertEquals(calls[1].headers.get("cookie"), "session=s");
});
