# `forwardTo`

`forwardTo(gateway, options?)` sends every request to a forwarding gateway instead of its own URL, and puts the URL it was going to in a header: `X-Forward-To`, or the `header` option. `gateway` must be an absolute `http:` or `https:` URL, and `header` a valid header name; anything else, or an unknown option, throws a `FaxiosError` when you call `forwardTo` (`ERR_BAD_OPTION_VALUE`, or `ERR_BAD_OPTION` for an unknown key).

```ts
import faxios from "@gcmdev/faxios";
import { forwardTo } from "@gcmdev/faxios/plugins/forward-to";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(retry())
  .use(forwardTo("http://gateway.local:8888/"));

await api.get("/accounts/{id}", { pathParams: { id: "acme co" }, params: { limit: 5 } });
// fetch: GET http://gateway.local:8888/
//        X-Forward-To: https://api.example.com/accounts/acme%20co?limit=5

await api.get("/health", { forward: false }); // straight to https://api.example.com/health
```

The header carries the final URL, with `baseURL`, `pathParams` and the validated `params` (after `paramsSchema`) applied, because the plugin doesn't rewrite `url`: it wraps the request's `env.fetch`, or the global `fetch` when there is none, so it sees what the adapter is about to send. The gateway request keeps everything else the adapter sends (method, headers, body, signal, credentials and `fetchOptions`); only the URL and the forward header change. A runtime without a global `Request` (`env.Request: null`) works too. Each try `retry` makes is forwarded the same way, whether `retry` is installed before or after `forwardTo`.

Middleware and schemas still see the target URL, not the gateway. So [`authBearer`](/pages/plugins/auth-bearer)'s origin rule checks the target's origin: with both installed, the token is attached when the target is your API, and then goes to the gateway inside the forwarded request. `timing` reports the target URL too. With a custom `authBearer` header, `fetchOptions.redirect` is `"error"` for the forwarded request as well, so a redirect from the gateway rejects.

A request with `forward: false` goes straight to its own URL; `forward` accepts only `false`. The option is typed only on the instance `.use(forwardTo(…))` returns.
