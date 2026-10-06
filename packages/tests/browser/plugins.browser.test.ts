import { describe, expect, it } from "vitest";

import faxios from "#src/index.js";
import { authBearer } from "#src/lib/plugins/authBearer.js";
import * as plugins from "#src/lib/plugins/index.js";
import { retry } from "#src/lib/plugins/retry.js";
import { timing } from "#src/lib/plugins/timing.js";
import type { TimingEvent } from "#src/lib/plugins/timing.js";

import { installFetchMock } from "./helpers/fetchMock.js";

// The modules behind @gcmdev/faxios/plugins and its auth-bearer, retry and timing subpaths.
describe("built-in plugins (vitest browser)", () => {
  it("exports the same plugins from the barrel and each subpath", () => {
    expect({ ...plugins }).toEqual({ authBearer, retry, timing });
  });

  it("runs authBearer, retry and timing together", async () => {
    using mock = installFetchMock();
    mock.respondWith({ status: 503 });
    const events: Array<TimingEvent> = [];
    const api = faxios.create()
      .use(plugins.timing(event => events.push(event)))
      .use(plugins.authBearer(() => "browser-token"))
      .use(plugins.retry({ attempts: 2, delay: 0 }));

    await expect(api.get("/plugins")).rejects.toMatchObject({ response: { status: 503 } });

    expect(mock.requests).toHaveLength(2);
    expect(mock.lastRequest!.headers.get("authorization")).toBe("Bearer browser-token");
    expect(events).toHaveLength(1);
  });
});
