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

The token only goes to your API's origin. See [`authBearer`](/pages/plugins/auth-bearer) for which requests get the token, other schemes and headers, and redirects.

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

API keys are typically passed as a header or a query parameter, depending on what the API expects. A fixed key can go in the instance headers; to read it per request and keep it on your API's origin, use `authBearer` with `scheme: ""` as shown in [Other schemes and headers](/pages/plugins/auth-bearer#other-schemes-and-headers).

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
