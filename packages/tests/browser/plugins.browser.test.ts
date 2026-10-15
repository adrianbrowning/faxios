import { describe, expect, it } from "vitest";

import faxios from "#src/index.js";
import { authBearer } from "#src/lib/plugins/authBearer.js";
import * as pluginsEntry from "#src/lib/plugins/definePlugin.js";
import { forwardTo } from "#src/lib/plugins/forwardTo.js";
import { retry } from "#src/lib/plugins/retry.js";
import { timing } from "#src/lib/plugins/timing.js";
import type { TimingEvent } from "#src/lib/plugins/timing.js";

import { installFetchMock } from "./helpers/fetchMock.js";

// The modules behind @gcmdev/faxios/plugins and the auth-bearer, forward-to, retry and timing subpaths.
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

  it("sends nothing when an empty path param would collapse a relative URL into //host, and still sends the token for a filled one", async () => {
    using mock = installFetchMock();
    const api = faxios.create().use(authBearer(() => "page-token"));

    await expect(api.get("/{org}/{repo}", { pathParams: { org: "", repo: "evil.test" } }))
      .rejects.toMatchObject({ code: "ERR_BAD_OPTION_VALUE" });
    await api.get("/{org}/{repo}", { pathParams: { org: "acme", repo: "evil.test" } });

    expect(mock.requests.map(request => [ new URL(request.url).host === location.host, request.headers.get("authorization") ])).toEqual([
      [ true, "Bearer page-token" ],
    ]);
  });

  it("forwards a relative request to the gateway with its page-resolved URL in X-Forward-To", async () => {
    using mock = installFetchMock();
    const api = faxios.create().use(forwardTo("https://gateway.test/"));

    await api.get("/items", { params: { q: "1" } });

    expect(mock.requests.map(request => [ request.url, request.headers.get("x-forward-to") ])).toEqual([
      [ "https://gateway.test/", `${location.origin}/items?q=1` ],
    ]);
  });

  // Browsers can't send a stream body over HTTP/1.1 (Firefox and Safari not at all), so a forwarded
  // body that wasn't a stream goes to the gateway as bytes.
  it("forwards a POST body to the gateway as bytes, not as a stream", async () => {
    using mock = installFetchMock();
    const api = faxios.create().use(forwardTo("https://gateway.test/"));

    await api.post("/items", { name: "a" });

    const [ , init ] = mock.fetch.mock.calls[0] as [unknown, RequestInit & { duplex?: unknown; }];
    expect(init.body).toBeInstanceOf(ArrayBuffer);
    expect(init.duplex).toBeUndefined();
    expect(await mock.lastRequest!.text()).toBe(JSON.stringify({ name: "a" }));
    expect(mock.lastRequest!.headers.get("x-forward-to")).toBe(`${location.origin}/items`);
  });
});
