# `authenticate`

`authenticate(getCredentials, options?)` puts credentials on requests to your API: headers, query string parameters and, on server runtimes, cookies. It calls `getCredentials` (which may return an object or a promise) on each of them, so one store can feed every place an API reads credentials from. [`authBearer`](/pages/plugins/auth-bearer) is `authenticate` with one header.

```ts
import faxios from "@gcmdev/faxios";
import { authenticate } from "@gcmdev/faxios/plugins/authenticate";

const store = { key: "my-api-key", session: "abc123" };

const api = faxios.create({ baseURL: "https://legacy.example.com" })
  .use(authenticate(() => ({
    query: { api_key: store.key },
    cookies: { session: store.session },
  })));

// GET https://legacy.example.com/orders?page=2&api_key=my-api-key
// Cookie: session=abc123
await api.get("/orders", { params: { page: 2 } });
```

## Credentials

`getCredentials` gives an object with up to three places, each a map from name to value:

| Place | Sent as |
| --- | --- |
| `headers` | One header per entry. The value is the whole header value, such as `{ Authorization: "Token abc" }`. |
| `query` | Query string parameters, added to the request's `params` (an object or `URLSearchParams`). The caller's `params` object isn't changed. |
| `cookies` | One `Cookie` header, `name=value` pairs joined with `; `. Server runtimes only, see [Cookies](#cookies). |

A value other than a non-empty string (`null`, `undefined`, `""`) sends nothing for that name, and a `getCredentials` that gives `null` or `undefined` sends nothing at all. So a signed-out store never sends `api_key=null`.

`getCredentials` is called on every request that gets the credentials, so a value you update in your store is picked up on the next request. With [`retry`](/pages/plugins/retry) installed before `authenticate`, it is called on every try.

Credentials that can't be sent as given reject the request with a `FaxiosError` before anything is sent: `ERR_BAD_OPTION` for a place other than these three (such as `params`), and `ERR_BAD_OPTION_VALUE` for a result that isn't an object, a place that isn't an object, a header or cookie name that isn't a valid token, an empty query parameter name, or a cookie value with a character a cookie can't hold (whitespace, `"`, `,`, `;` or `\`). A cookie value with `;` would otherwise add a cookie of its own.

A header, query parameter or `Cookie` header the request already has, set per request or in the instance defaults, is kept. Pass `overwrite: true` to replace it.

## Which requests get the credentials

The credentials go only to your API's origin, by the same rule as [`authBearer`](/pages/plugins/auth-bearer#which-requests-get-the-token): the origin of an absolute instance `baseURL`, or only relative request URLs when the instance has none. A per-request `baseURL` doesn't widen the rule, and `getCredentials` isn't called for a request that doesn't get them. To send them to more than one host, list the exact origins in `origins`:

```ts
import faxios from "@gcmdev/faxios";
import { authenticate } from "@gcmdev/faxios/plugins/authenticate";

const api = faxios.create({ allowAbsoluteUrls: true })
  .use(authenticate(() => ({ headers: { "X-Api-Key": "my-api-key" } }), {
    origins: [ "https://api.example.com", "https://uploads.example.com" ],
  }));

await api.get("https://api.example.com/me");
```

## Redirects and logs

When a redirect leaves the origin, `fetch` drops `Authorization` but sends every other header, `Cookie` included, on to the new host. So when `authenticate` sets any header other than `Authorization`, or a cookie, it sets [`fetchOptions.redirect`](/pages/advanced/fetch-adapter#fetch-options) to `"error"` unless the request sets `redirect` itself. A redirect then rejects with `ERR_NETWORK`. A query parameter doesn't need this: the redirect target's URL comes from the server, not from the request.

`authenticate` adds every header name it sets other than `Authorization`, and every query parameter name, to the request's [`redact`](/pages/advanced/request-config#redact) list, so `error.toJSON()` masks the values. `Authorization` and `Cookie` are masked by default.

A query string credential still ends up in the URL, which servers, proxies and browser history record. Prefer a header when the API accepts one.

## Cookies

A browser doesn't let a request set the `Cookie` header: `fetch` drops it without an error, and the request would go out unauthenticated. So in a browser, a request whose credentials include a cookie rejects with `ERR_BAD_OPTION_VALUE` and sends nothing. The same goes for `authBearer` with `header: "Cookie"`. In a browser, let the browser send its own cookies: they go with same-origin requests by default, and with cross-origin ones when you set [`withCredentials: true`](/pages/advanced/request-config#withcredentials).

On Node, Deno and Bun, `cookies` sets the `Cookie` header, which suits a server that calls an API with a session it holds.

## Ordering

Install `authenticate` after [`retry`](/pages/plugins/retry), so each try asks for the credentials again. Invalid options throw `ERR_BAD_OPTION_VALUE` when you call `authenticate`, and unknown ones `ERR_BAD_OPTION`.
