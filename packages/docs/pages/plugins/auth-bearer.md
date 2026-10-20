# `authBearer`

`authBearer(getToken, options?)` sets `Authorization: Bearer <token>` on requests to your API, calling `getToken` (which may return a string or a promise) on each of them. A header the request already has is kept unless you pass `overwrite: true`. By default the token goes only to the origin of the instance `baseURL` when that is absolute, and only to relative URLs otherwise; a per-request `baseURL` never gets it, and `origins` replaces the rule. A request core would reject (an absolute URL with `allowAbsoluteUrls: false`) gets no token, and `getToken` isn't called. It provides the `auth` capability, which [`requireSignIn`](/pages/plugins/writing-a-plugin#capabilities) uses. Install [`refreshOn401`](/pages/advanced/middleware#refreshing-a-token-after-a-401) before it, so a retry gets a fresh header.

`authBearer` is [`authenticate`](/pages/plugins/authenticate) with one header, so the origin rule, redirect handling and `redact` work the same way. Use `authenticate` when an API reads credentials from more than one header, or from the query string or cookies.

For Basic auth, API keys, token refresh and cookies, see [Authentication](/pages/advanced/authentication).

## Bearer tokens (JWT)

The built-in `authBearer` plugin sets `Authorization: Bearer <token>` on every request to your API:

```ts
import faxios from "@gcmdev/faxios";
import { authBearer } from "@gcmdev/faxios/plugins/auth-bearer";

const store = { token: "my-access-token" };

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(authBearer(() => store.token));

await api.get("/me");
```

`getToken` may return a string or a promise. It is called on every request that gets the token, so a token you update in your store is picked up on the next request. With `retry` installed before `authBearer`, it is called on every try.

If `getToken` gives anything other than a non-empty string (`null`, `undefined`, `""`, a number, an object), the request is sent without the header. A signed-out user never sends `Bearer null`.

A header the request already has, set per request or in the instance defaults, is kept and `getToken` isn't called. Pass `overwrite: true` to replace it.

### Which requests get the token

The token only goes to your API's origin, which is the origin of the instance's `baseURL` (the one you passed to `faxios.create()`). The request URL is resolved the way core sends it, with [`resolveRequestURL`](/pages/plugins/writing-a-plugin):

- With an absolute instance `baseURL`, only requests whose resolved origin equals that origin get it. This matters with `allowAbsoluteUrls: true`; with the default `false`, an absolute URL rejects with `ERR_INVALID_URL`, and `getToken` is never called for it.
- A per-request `baseURL` doesn't change the rule. `api.get("/x", { baseURL: "https://partner.example" })` resolves to the partner's origin, so it goes without the token, unless that origin is the instance's or is listed in `origins`.
- With a relative or missing instance `baseURL`, only relative request URLs get it, never an absolute or protocol-relative one (`//host`, `/\host`). So the default export, which has no `baseURL`, never sends the token to an absolute URL, even one a per-request `baseURL` produces.
- A request URL with a `pathParams` placeholder in its scheme or host (`"{scheme}://api.example.com"`, `"https://{host}/x"`) never gets the token, even when the filled-in URL is your API's. The placeholder would let a path param decide where the token goes. Placeholders in the path or query are fine: a path param is percent-encoded, so it can't add a `/`, `:` or `@`, and an empty one rejects with `ERR_BAD_OPTION_VALUE` instead of joining the slashes around it (`/{org}/{repo}` becoming `//host`).

This is a security rule. Before it, a token installed on the default export followed any absolute URL, so a request to a third-party host leaked your credentials.

To send the token to more than one host, list them in `origins`. It replaces the default rule: only those exact origins (scheme, host and port) get the token.

```ts
import faxios from "@gcmdev/faxios";
import { authBearer } from "@gcmdev/faxios/plugins/auth-bearer";

const api = faxios.create({ allowAbsoluteUrls: true }).use(authBearer(() => "my-access-token", {
  origins: [ "https://api.example.com", "https://uploads.example.com" ],
}));

await api.get("https://api.example.com/me");
await api.put("https://uploads.example.com/avatar", "...");
```

Entries must be bare origins, without a path. A relative request URL counts only in a browser, as the page origin.

With [`forwardTo`](/pages/plugins/forward-to) installed as well, the rule still checks the target URL, not the gateway: forwarding happens in `fetch`, after middleware. A request whose target is your API gets the token, and the forwarded request carries it to the gateway, so install `forwardTo` only for a gateway you trust with your credentials. The same holds for the XSRF header ([`withXSRFToken`](/pages/advanced/request-config#withxsrftoken)): its same-origin check also runs against the target URL, so a same-origin target sends the XSRF cookie's value to a cross-origin gateway as well.

Invalid options throw `ERR_BAD_OPTION_VALUE` and unknown ones `ERR_BAD_OPTION`.

### Other schemes and headers

`scheme` (default `"Bearer"`) and `header` (default `"Authorization"`) change what is sent. An empty `scheme` sends the bare token, which suits an API key in one header. For a key in the query string, or credentials in several places, use [`authenticate`](/pages/plugins/authenticate).

In a browser, `header: "Cookie"` rejects with `ERR_BAD_OPTION_VALUE`, since `fetch` drops that header. Use [`withCredentials`](/pages/advanced/request-config#withcredentials) there.

An example with `X-Api-Key`:

```ts
import faxios from "@gcmdev/faxios";
import { authBearer } from "@gcmdev/faxios/plugins/auth-bearer";

// Sends `X-Api-Key: your-api-key-here`
const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(authBearer(() => "your-api-key-here", { scheme: "", header: "X-Api-Key" }));

await api.get("/data");
```

#### Redirects with a custom header

When a redirect leaves the origin, `fetch` drops `Authorization` but sends every other header on to the new host. So with a custom `header`, `authBearer` sets [`fetchOptions.redirect`](/pages/advanced/fetch-adapter#fetch-options) to `"error"` on the requests it adds the header to, unless the request sets `redirect` itself. A redirect then rejects with `ERR_NETWORK`, and your key never reaches another host. With the default `Authorization` header, redirects are followed as usual.

To follow redirects anyway, set `redirect` on the request, for example `fetchOptions: { redirect: "follow" }`. Do that only for an API whose redirects you trust, since the key then goes to wherever a redirect points.

`authBearer` also adds a custom `header` to the request's [`redact`](/pages/advanced/request-config#redact) list, so `error.toJSON()` masks your key the same way it masks `Authorization`.
