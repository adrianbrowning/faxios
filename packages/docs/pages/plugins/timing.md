# `timing`

`timing(onTiming)` measures the time around `next` and calls `onTiming` once per request with a `TimingEvent`:

- on success: `{ method, url, attempt, durationMs, status }`
- on failure: `{ method, url, attempt, durationMs, error }`, where `error` is `{ code, message, status }`, and the request's error is then rethrown

`method` is upper-cased. `url` is the full URL with `baseURL` applied, as [`resolveRequestURL`](/pages/plugins/writing-a-plugin) resolves it, and with any `user:pass@`, the query string and the fragment stripped, since those often carry secrets. A URL with `pathParams` is reported by its template as the caller wrote it (e.g. `/users/{id}`), which keeps metric labels low-cardinality. A URL core rejects, such as an absolute URL with `allowAbsoluteUrls: false`, is reported as the request gave it, not joined to `baseURL`. `durationMs` comes from `performance.now()` where available. The response is returned unchanged.

`error.code` is the `FaxiosError` code (such as `"ERR_NETWORK"` or `"ETIMEDOUT"`), or the thrown error's own string `code`; `error.status` is the HTTP status when a response arrived. Each is `undefined` otherwise. The event carries no config, headers or body, not even inside `error`: the error a request rejects with holds its config, and so its credentials (`Authorization` headers, tokens in query strings, request bodies), which would then end up in logs. `error.message` is the error's message with any URL `user:pass@` stripped. The rest of the message is the error's own text, so the event is safe to log as long as your middleware, transforms and schemas keep secrets out of the errors they throw. To inspect the full error, catch the request's rejection instead.

`attempt` is the context's [`ctx.attempt`](/pages/advanced/middleware#the-context) once the request settles:

- installed after `retry`, `timing` reports each try with its own number;
- installed before `retry`, one event covers every try and carries the final try's number, as long as no middleware between them passes `next` a copy of the context (`authBearer` and `authenticate` do, so install them after `retry`);
- without `retry`, it is 1.

If `onTiming` throws while reporting a failure, the request still rejects with its own error. If it throws while reporting a success, the request rejects with `onTiming`'s error.

This sends durations to a metrics client, labelled by method, URL template and status:

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";
import { timing } from "@gcmdev/faxios/plugins/timing";

// Stands in for your metrics client.
const metrics = {
  histogram(name: string, value: number, labels: Record<string, string>) {
    console.log(name, value, labels);
  },
};

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(retry())
  .use(timing(event => {
    metrics.histogram("http_client_duration_ms", event.durationMs, {
      method: event.method,
      url: event.url,
      status: event.status === undefined ? "error" : String(event.status),
    });
  }));

await api.get("/users/{id}", { pathParams: { id: "7" } });
// labels: { method: "GET", url: "https://api.example.com/users/{id}", status: "200" }
```

Here `timing` is installed after `retry`, so each try is measured on its own. Install it first to measure all tries together.
