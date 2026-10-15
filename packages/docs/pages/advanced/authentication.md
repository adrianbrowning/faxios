# Authentication

Most APIs require some form of authentication. This page covers the most common patterns for attaching credentials to faxios requests.

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

The token only goes to your API's origin, which is the origin of the instance's `baseURL` (the one you passed to `faxios.create()`). The request URL is resolved the way core sends it, with [`resolveRequestURL`](/pages/advanced/middleware#writing-a-plugin):

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

With [`forwardTo`](/pages/advanced/middleware#forwardto) installed as well, the rule still checks the target URL, not the gateway: forwarding happens in `fetch`, after middleware. A request whose target is your API gets the token, and the forwarded request carries it to the gateway, so install `forwardTo` only for a gateway you trust with your credentials. The same holds for the XSRF header ([`withXSRFToken`](/pages/advanced/request-config#withxsrftoken)): its same-origin check also runs against the target URL, so a same-origin target sends the XSRF cookie's value to a cross-origin gateway as well.

Invalid options throw `ERR_BAD_OPTION_VALUE` and unknown ones `ERR_BAD_OPTION`.

### Other schemes and headers

`scheme` (default `"Bearer"`) and `header` (default `"Authorization"`) change what is sent. An empty `scheme` sends the bare token, which suits API keys:

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

## HTTP Basic auth

For APIs that use HTTP Basic authentication, pass the `auth` option. faxios will encode the credentials and set the `Authorization` header automatically:

```js
import faxios from "@gcmdev/faxios";

const response = await faxios.get("https://api.example.com/data", {
  auth: {
    username: "myUser",
    password: "myPassword",
  },
});
```

If `auth` is not supplied, faxios can also derive Basic auth credentials from the request URL, for example `https://myUser:myPassword@api.example.com/data`. Percent-encoded URL credentials are decoded before the `Authorization` header is generated. Prefer the explicit `auth` option for new code; it takes precedence over URL-embedded credentials.

::: tip
`auth` is only for HTTP Basic. For Bearer tokens and API keys, use [`authBearer`](#bearer-tokens-jwt) or a custom header.
:::

## API keys

API keys are typically passed as a header or a query parameter, depending on what the API expects. A fixed key can go in the instance headers; to read it per request and keep it on your API's origin, use `authBearer` with `scheme: ""` as shown [above](#other-schemes-and-headers).

```js
import faxios from "@gcmdev/faxios";

// As a header
const api = faxios.create({
  baseURL: "https://api.example.com",
  headers: { "X-API-Key": "your-api-key-here" },
});

// As a query parameter
const response = await faxios.get("https://api.example.com/data", {
  params: { apiKey: "your-api-key-here" },
});
```

## Token refresh

A refresh plugin retries a request once after a 401. Install it before `authBearer`, and let `authBearer` set the header:

```ts
import faxios, { FaxiosError } from "@gcmdev/faxios";
import { definePlugin } from "@gcmdev/faxios/plugins";
import { authBearer } from "@gcmdev/faxios/plugins/auth-bearer";

function refreshOn401(refresh: () => Promise<void>) {
  let refreshing: Promise<void> | undefined;
  return definePlugin({
    name: "refreshOn401",
    middleware: async (ctx, next) => {
      try {
        return await next(ctx);
      }
      catch (err) {
        if (!(err instanceof FaxiosError) || err.response?.status !== 401) throw err;
        // Concurrent 401s wait for the same refresh.
        refreshing ??= refresh().finally(() => {
          refreshing = undefined;
        });
        await refreshing;
        // authBearer runs again inside next, so the retry gets the new token.
        return next(ctx);
      }
    },
  });
}

let token = "expired";
const getToken = () => token;
const refresh = async () => {
  const { data } = await faxios.post<{ access_token?: string }>("https://api.example.com/auth/refresh");
  token = data.access_token ?? token;
};

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(refreshOn401(refresh))
  .use(authBearer(getToken));

await api.get("/me");
```

A 401 arrives as a rejection, not a response, because the default `validateStatus` rejects non-2xx statuses. That's why the plugin catches a `FaxiosError` and checks `err.response?.status`.

The plugin never sets `Authorization` itself. On the retry `authBearer` calls `getToken` again and applies its origin rule, so a 401 from a third-party URL is retried without your token. All 401s share one in-flight refresh: with rotating refresh tokens, a second refresh would send a token the first one already spent, and the server would log the user out.

Calling `next` twice is safe when the body can be read again, such as a string, an object, a `Blob` or `FormData`. A stream body is used up by the first try, so sending it again rejects with a `FaxiosError` whose code is `ERR_BAD_REQUEST`.

## Cookie-based authentication

For session-based APIs that rely on cookies, set `withCredentials: true` to include cookies in cross-origin requests:

```js
import faxios from "@gcmdev/faxios";

const api = faxios.create({
  baseURL: "https://api.example.com",
  withCredentials: true, // send cookies with every request
});
```

::: warning
`withCredentials: true` requires the server to respond with `Access-Control-Allow-Credentials: true` and a specific (non-wildcard) `Access-Control-Allow-Origin`.
:::
