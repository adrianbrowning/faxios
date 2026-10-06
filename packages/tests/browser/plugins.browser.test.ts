import { describe, expect, it } from "vitest";

import faxios from "#src/index.js";
import { authBearer } from "#src/lib/plugins/authBearer.js";
import * as pluginsEntry from "#src/lib/plugins/definePlugin.js";
import { retry } from "#src/lib/plugins/retry.js";
import { timing } from "#src/lib/plugins/timing.js";
import type { TimingEvent } from "#src/lib/plugins/timing.js";

import { installFetchMock } from "./helpers/fetchMock.js";

// The modules behind @gcmdev/faxios/plugins and the auth-bearer, retry and timing subpaths.
describe("plugin entry points (vitest browser)", () => {
  it("exports only definePlugin from the plugins entry point", () => {
    expect(Object.keys(pluginsEntry)).toEqual([ "definePlugin" ]);
  });

  it("runs authBearer, retry and timing together", async () => {
    using mock = installFetchMock();
    mock.respondWith({ status: 503 });
    const events: Array<TimingEvent> = [];
    const api = faxios.create()
      .use(timing(event => events.push(event)))
      .use(authBearer(() => "browser-token"))
      .use(retry({ attempts: 2, delay: 0 }));

    await expect(api.get("/plugins")).rejects.toMatchObject({ response: { status: 503 } });

    expect(mock.requests).toHaveLength(2);
    expect(mock.lastRequest!.headers.get("authorization")).toBe("Bearer browser-token");
    expect(events).toHaveLength(1);
  });
});
