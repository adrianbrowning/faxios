import { assertEquals } from "@std/assert";
import faxios, * as root from "faxios";
import * as plugins from "faxios/plugins";
import { authBearer } from "faxios/plugins/auth-bearer";
import { retry } from "faxios/plugins/retry";
import { timing } from "faxios/plugins/timing";
import type { TimingEvent } from "faxios/plugins/timing";

Deno.test("Deno plugins: barrel and subpaths export the same plugins, the root none", () => {
  assertEquals({ ...plugins }, { authBearer, retry, timing });
  for (const name of [ "authBearer", "retry", "timing" ]) {
    assertEquals(Object.hasOwn(root, name), false);
  }
});

Deno.test("Deno plugins: authBearer, retry and timing run together", async () => {
  const calls: Array<Request> = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(new Request(input, init));
    return new Response(null, { status: calls.length === 1 ? 503 : 200 });
  };
  const events: Array<TimingEvent> = [];
  const api = faxios.create({ env: { fetch } })
    .use(timing(event => events.push(event)))
    .use(authBearer(() => "deno-token"))
    .use(retry({ attempts: 2, delay: 0 }));

  const response = await api.get("https://example.com/plugins");

  assertEquals(response.status, 200);
  assertEquals(calls.length, 2);
  assertEquals(calls[1]!.headers.get("authorization"), "Bearer deno-token");
  assertEquals(events.map(event => event.status), [ 200 ]);
});
