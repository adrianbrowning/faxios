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

The built-in [`refreshAuth`](/pages/plugins/refresh-auth) plugin refreshes your credentials after a 401 and sends the request again, once. Install it before `authBearer` or `authenticate`, which put the new credentials on the second try:

```ts
import faxios from "@gcmdev/faxios";
import { authBearer } from "@gcmdev/faxios/plugins/auth-bearer";
import { refreshAuth } from "@gcmdev/faxios/plugins/refresh-auth";

let token = "expired";

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(refreshAuth(async () => {
    // refreshAuth: false, so a 401 on the refresh call itself rejects instead of waiting on the refresh.
    const { data } = await api.post<{ access_token: string }>("/auth/refresh", null, { refreshAuth: false });
    token = data.access_token;
  }))
  .use(authBearer(() => token));

await api.get("/me");
```

Concurrent 401s share one refresh, so a rotating refresh token is spent once, and a 401 from another host never triggers one. A cookie session works the same way: in a browser, the refresh response's `Set-Cookie` updates the cookie the retry sends (for a cross-origin API, set `withCredentials: true` on the instance the refresh call goes through). See [`refreshAuth`](/pages/plugins/refresh-auth) for which failures refresh, 403s, and cancellation.

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
