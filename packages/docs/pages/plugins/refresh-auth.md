# `refreshAuth`

`refreshAuth(refresh, options?)` refreshes your credentials when a request to your API fails with a 401, then sends that request again, once. It never sets credentials itself: install it before [`authenticate`](/pages/plugins/authenticate) or [`authBearer`](/pages/plugins/auth-bearer), which put the refreshed ones on the second try.

```ts
import faxios from "@gcmdev/faxios";
import { authBearer } from "@gcmdev/faxios/plugins/auth-bearer";
import { refreshAuth } from "@gcmdev/faxios/plugins/refresh-auth";
import { retry } from "@gcmdev/faxios/plugins/retry";

const store = { token: "expired", refreshToken: "r1" };

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(refreshAuth(async () => {
    const { data } = await api.post<{ access_token: string }>(
      "/auth/refresh",
      { refresh_token: store.refreshToken },
      { refreshAuth: false, redact: ["refresh_token"], timeout: 10_000 },
    );
    store.token = data.access_token;
  }))
  .use(retry())
  .use(authBearer(() => store.token));

await api.get("/me");
```

`refresh` can return anything, a promise included; `refreshAuth` waits for it and ignores the value. It gets the `FaxiosError` that triggered it. With `responseType: "stream"`, that error's body is already cancelled. Update the store `getToken` or `getCredentials` reads, and the second try sends the new value.

## When it refreshes

A failed request refreshes and is sent again when all of these hold:

- It failed with a `FaxiosError` whose response status is in `statuses` (default `[401]`), or for which `refreshOn(error)` returns `true`. `refreshOn` replaces the status check.
- It went to your API's origin, by the same rule as [`authBearer`](/pages/plugins/auth-bearer#which-requests-get-the-token): the origin of an absolute instance `baseURL`, or only relative URLs without one. `origins` replaces the rule; give it the same list as `authenticate` or `authBearer`. A request to another host never spends your refresh token. The response must come from the API too: when the API redirects to another host and that host answers 401, nothing refreshes, because new credentials wouldn't help there. faxios reads this from [`response.redirected` and `response.url`](/pages/advanced/response-schema). A response fetch doesn't call redirected, such as one a test's `fetch` builds by hand, counts as the API's. An error without a response, such as a network error `refreshOn` matches, skips this check.
- Its body can be sent again. A stream body is used up by the first try, so that request rejects with its 401.
- Its signal hasn't aborted.
- It doesn't set `refreshAuth: false`.

Any method is sent again, POST included. After a 401 that is safe: the server refused the request, so it didn't act on it. If `statuses` or `refreshOn` match other failures, such as a 5xx or a network error, the server may already have processed the request, so a POST can run twice. The second try is the last: if it fails, with a 401 or anything else, the request rejects with that error.

`ctx.attempt` doesn't count the second try. Without `retry` it stays 1; `retry` installed after `refreshAuth` counts the second try's attempts from 1 again.

A 403 usually means "signed in, but not allowed", which new credentials don't fix. Add it to `statuses` only if your API sends 403 for expired credentials.

## One refresh at a time

Requests that fail while a refresh runs wait for it instead of starting their own, so `refresh` runs once and a rotating refresh token is spent once. `refresh` gets the error of the request that started it.

A request to the API that starts while a refresh runs waits for it before it is sent. It then goes out once, with the new credentials. If `refresh` rejects or throws, the request rejects with that error and isn't sent. After the wait it is a normal request: a 401 on it refreshes once and sends it again once. A request to another origin, or one that sets `refreshAuth: false`, never waits.

A request that went out before the last refresh finished, and fails after, failed with the credentials that refresh replaced. It is sent again without another refresh. A request that passed `refreshAuth` before the refresh started doesn't wait. If the refresh finishes while that request is getting its credentials, it may already have the new ones; a 401 on it is then sent once more with the same credentials.

If `refresh` rejects or throws, every request waiting on it rejects with that error. The next 401 starts a new refresh.

## The refresh call

The refresh call must set `refreshAuth: false`, as above, or go through another instance or the default export. Otherwise it is a request to the API that starts while the refresh runs, so it waits for the refresh it is part of. The refresh can't finish until it does, so the refresh call rejects with `ETIMEDOUT` when its `timeout` runs out, or never settles without one, and every request waiting on the refresh waits with it. `refreshAuth: false` also suits a sign-in request, whose 401 means wrong credentials rather than expired ones. The option takes only `false`; anything else rejects with `ERR_BAD_OPTION_VALUE`.

Give the refresh call a `timeout`. Every waiting request waits for it, so a refresh call that hangs holds them all. The `timeout` covers the whole request, including the time it spends waiting in middleware.

The refresh call's error reaches every request that was waiting on it, so it can end up in their logs. Add the refresh token's field to that call's [`redact`](/pages/advanced/request-config#redact), as above, so `toJSON()` masks it.

## Cancellation

Aborting a request's signal while it waits for the refresh rejects it at once with `CanceledError`, whether it failed and is waiting to be sent again or started during the refresh and hasn't been sent; the refresh goes on for the requests still waiting. A signal that aborts after the refresh rejects the second try with `CanceledError` before anything is sent.

## Ordering

Install `refreshAuth` first, then [`retry`](/pages/plugins/retry), then `authenticate` or `authBearer`. Each request then refreshes at most once, and a try after the refresh still gets `retry`'s attempts for transient failures. With `retry` installed before `refreshAuth`, each try could refresh.

Invalid options throw `ERR_BAD_OPTION_VALUE` when you call `refreshAuth`, and unknown ones `ERR_BAD_OPTION`.
