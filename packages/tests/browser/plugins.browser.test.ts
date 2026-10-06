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

  it("sends authBearer's token only to the page origin or the listed origins", async () => {
    using mock = installFetchMock();
    const sameOrigin = faxios.create().use(authBearer(() => "page-token"));
    const listed = faxios.create({ allowAbsoluteUrls: true })
      .use(authBearer(() => "listed-token", { origins: [ location.origin ] }));

    await sameOrigin.get("/relative");
    await sameOrigin.get("https://evil.test/absolute");
    await sameOrigin.get("//evil.test/protocol-relative");
    await listed.get("/relative");
    await listed.get(`${location.origin}/absolute`);
    await listed.get("https://evil.test/absolute");

    expect(mock.requests.map(request => [ new URL(request.url).host === location.host, request.headers.get("authorization") ])).toEqual([
      [ true, "Bearer page-token" ],
      [ false, null ],
      [ false, null ],
      [ true, "Bearer listed-token" ],
      [ true, "Bearer listed-token" ],
      [ false, null ],
    ]);
  });
});
