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
`auth` is only for HTTP Basic. For Bearer tokens use [`authBearer`](#bearer-tokens-jwt); for API keys and other credentials, [`authenticate`](/pages/plugins/authenticate).
:::

## API keys

API keys are typically passed as a header or a query parameter, depending on what the API expects. [`authenticate`](/pages/plugins/authenticate) reads the key on each request and sends it only to your API's origin, in whichever place you name:

```ts
import faxios from "@gcmdev/faxios";
import { authenticate } from "@gcmdev/faxios/plugins/authenticate";

const store = { key: "your-api-key-here" };

// As a header: X-API-Key: your-api-key-here
const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(authenticate(() => ({ headers: { "X-API-Key": store.key } })));

// As a query parameter: /data?apiKey=your-api-key-here
const legacy = faxios.create({ baseURL: "https://legacy.example.com" })
  .use(authenticate(() => ({ query: { apiKey: store.key } })));

await api.get("/data");
await legacy.get("/data");
```

Instance-level `headers` or `params` would also work for a fixed key, but they go to every URL the instance sends to, absolute ones to other hosts included.

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

### Cookies on a server

On Node, Deno and Bun nothing sends cookies for you. Use `authenticate` with `cookies`, which sets the `Cookie` header on requests to your API. An API that wants a session cookie and a query string key gets both from one store:

```ts
import faxios from "@gcmdev/faxios";
import { authenticate } from "@gcmdev/faxios/plugins/authenticate";

const store = { key: "my-api-key", session: "abc123" };

const api = faxios.create({ baseURL: "https://legacy.example.com" })
  .use(authenticate(() => ({
    query: { api_key: store.key },
    cookies: { session: store.session },
  })));

await api.get("/orders");
```

In a browser, a request can't set `Cookie`, so `authenticate` rejects one whose credentials include a cookie. See [Cookies](/pages/plugins/authenticate#cookies).
