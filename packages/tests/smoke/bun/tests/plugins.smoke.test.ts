import { describe, expect, test } from "bun:test";
import faxios, * as root from "faxios";
import * as plugins from "faxios/plugins";
import { authBearer } from "faxios/plugins/auth-bearer";
import { retry } from "faxios/plugins/retry";
import { timing } from "faxios/plugins/timing";
import type { TimingEvent } from "faxios/plugins/timing";

describe("plugin subpaths", () => {
  test("barrel and subpaths export the same plugins, the root none", () => {
    expect({ ...plugins }).toEqual({ authBearer, retry, timing });
    for (const name of [ "authBearer", "retry", "timing" ]) {
      expect(Object.hasOwn(root, name)).toBe(false);
    }
  });

  test("authBearer, retry and timing run together", async () => {
    const calls: Array<Request> = [];
    const fetch = async (input: unknown, init?: RequestInit) => {
      calls.push(new Request(input as string, init));
      return new Response(null, { status: calls.length === 1 ? 503 : 200 });
    };
    const events: Array<TimingEvent> = [];
    const api = faxios.create({ env: { fetch } })
      .use(timing(event => events.push(event)))
      .use(authBearer(() => "bun-token"))
      .use(retry({ attempts: 2, delay: 0 }));

    const response = await api.get("https://example.com/plugins");

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.headers.get("authorization")).toBe("Bearer bun-token");
    expect(events.map(event => event.status)).toEqual([ 200 ]);
  });
});
