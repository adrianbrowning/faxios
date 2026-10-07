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

A header the request already has, set per request or in the instance defaults, is kept and `getToken` isn't called. Pass `overwrite: true` to replace it.

### Which requests get the token

The token only goes to your API's origin:

- With an absolute `baseURL`, only requests whose resolved origin equals the `baseURL` origin get it. This matters with `allowAbsoluteUrls: true`; with the default `false`, an absolute URL is appended to the `baseURL` and stays on it.
- With a relative or missing `baseURL`, only relative request URLs get it, never an absolute or protocol-relative one (`//host`, `/\host`). So the default export, which has no `baseURL`, never sends the token to an absolute URL.

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

`authBearer` provides an `auth` capability: plugins installed after it can call `ctx.capabilities.auth.getToken()` to get the current token. The capability ignores the origin rule. A refresh plugin uses it to retry a request once with a fresh token:

```ts
import faxios, { FaxiosError } from "@gcmdev/faxios";
import type { FaxiosContext } from "@gcmdev/faxios";
import { definePlugin } from "@gcmdev/faxios/plugins";
import { authBearer } from "@gcmdev/faxios/plugins/auth-bearer";
import type { AuthBearerCapability } from "@gcmdev/faxios/plugins/auth-bearer";

function refreshOn401(refresh: () => Promise<void>) {
  return definePlugin({
    name: "refreshOn401",
    middleware: async (ctx: FaxiosContext<unknown, AuthBearerCapability>, next) => {
      try {
        return await next(ctx);
      }
      catch (err) {
        if (!(err instanceof FaxiosError) || err.response?.status !== 401) throw err;
        await refresh();
        ctx.config.headers.set("Authorization", `Bearer ${await ctx.capabilities.auth.getToken()}`);
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
  .use(authBearer(getToken))
  .use(refreshOn401(refresh));

await api.get("/me");
```

A 401 arrives as a rejection, not a response, because the default `validateStatus` rejects non-2xx statuses. That's why the plugin catches a `FaxiosError` and checks `err.response?.status`.

Calling `next` twice is safe: each `next()` dispatches its own copy of the config.

The middleware's `ctx` annotation declares that the plugin requires `auth`. Installing `refreshOn401` before `authBearer`, or without it, is a type error. See [Writing a plugin](/pages/advanced/middleware#writing-a-plugin) for how capabilities and typed options work.

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
