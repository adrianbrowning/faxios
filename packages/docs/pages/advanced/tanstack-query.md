# TanStack Query

[TanStack Query](https://tanstack.com/query/latest) and faxios do different jobs, and they work together without an adapter:

- **TanStack Query owns server state and the UI lifecycle:** caching by query key, deduplicating requests, background refetching, stale and garbage-collection timing, and what a component shows while data loads. Either layer can retry; see [Choosing one retry owner](#choosing-one-retry-owner).
- **faxios is the typed request layer:** it builds and sends the request, applies instance defaults and [middleware](/pages/advanced/middleware), validates with your schemas, and types the response from them.

A faxios endpoint made with [`define()`](/pages/advanced/define) or [`route()`](/pages/advanced/route) is a plain async function, so the query function only has to call it with the request's params and the query's `signal` and return `response.data`; TanStack Query then types the query's data with the endpoint's inferred response type. Don't pass the endpoint itself as `queryFn`: TanStack Query calls the query function with its query context (`queryKey`, `signal`, `meta` and more), and faxios rejects the keys it doesn't know, such as `queryKey` and `meta`, as unknown request options.

## A typed query function

The examples on this page use `@tanstack/query-core`, the framework-agnostic core that every TanStack Query adapter is built on:

```bash
npm install @tanstack/query-core
```

`QueryClient.query` runs the query function, caches the result under the query key, and resolves with the data. Pass the `signal` TanStack Query gives the query function on to faxios, so a query TanStack Query cancels also cancels its request:

```ts expect=log:Ada%20Lovelace
import faxios from "@gcmdev/faxios";
import { QueryClient } from "@tanstack/query-core";
import { z } from "zod";

const api = faxios.create({
  baseURL: "https://api.example.com",
  // Stands in for the API in this example.
  env: {
    fetch: async () => Response.json({ id: "42", name: "Ada Lovelace" }),
  },
});

const getUser = api.define("get", "/users/{id}", {
  pathParamsSchema: z.object({ id: z.string() }),
  responseSchema: z.object({ id: z.string(), name: z.string() }),
});

const queryClient = new QueryClient();

const data = await queryClient.query({
  queryKey: [ "user", "42" ],
  queryFn: async ({ signal }) => (await getUser({ pathParams: { id: "42" }, signal })).data,
});

// `data` has the endpoint's inferred response type, not `any`.
const user: { id: string; name: string } = data;
// @ts-expect-error `name` is a string, not a number
const wrong: { name: number } = data;

console.log(user.name); // Ada Lovelace
```

The same query function works unchanged with a framework adapter such as `useQuery` in `@tanstack/react-query`, which re-exports the query-core types.

## Cancelling a query

TanStack Query aborts the query function's `signal` when it cancels a query: when you call `queryClient.cancelQueries`, or when the last observer of a query that is still fetching unsubscribes, as `useQuery` does when its component unmounts. A query function that passes that `signal` to faxios cancels the faxios request with it, so the request rejects with a `CanceledError` (code `ERR_CANCELED`), just as an aborted [`AbortController`](/pages/advanced/cancellation) does. TanStack Query ignores that rejection: the query doesn't turn into an error, and it goes back to the state it had before the fetch started. The promise that `queryClient.query` (or `fetchQuery`) returned still settles, though: it rejects with TanStack Query's own `CancelledError` (exported from `@tanstack/query-core`, detected with `error instanceof CancelledError`) when the query had no data before the fetch, and resolves with the restored data when it did. That is why the example catches the query promise, handling only the cancellation and rethrowing any other error. The cancellation adds no error of its own: `useQuery` observers see the state from before the fetch, which is the earlier error if the query had already failed.

```ts expect=log:fetch%3A%20aborted,log:faxios%3A%20CanceledError%20ERR_CANCELED,log:query%3A%20cancelled,log:state%3A%20pending%20idle
import faxios, { isCancel } from "@gcmdev/faxios";
import { CancelledError, QueryClient } from "@tanstack/query-core";
import { z } from "zod";

// Settles once the request reaches fetch, so the example cancels it in flight.
const fetchStarted = Promise.withResolvers<void>();

const api = faxios.create({
  baseURL: "https://api.example.com",
  // Stands in for a slow API: it never answers, and rejects once the request is aborted.
  env: {
    fetch: (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          console.log("fetch: aborted");
          reject(init.signal?.reason);
        });
        fetchStarted.resolve();
      }),
  },
});

const getUser = api.define("get", "/users/{id}", {
  pathParamsSchema: z.object({ id: z.string() }),
  responseSchema: z.object({ id: z.string(), name: z.string() }),
});

const queryClient = new QueryClient();
const queryKey = [ "user", "42" ];

const query = queryClient.query({
  queryKey,
  queryFn: async ({ signal }) => {
    try {
      return (await getUser({ pathParams: { id: "42" }, signal })).data;
    } catch (error) {
      // Only here to show what faxios rejected with; TanStack Query ignores it.
      if (isCancel(error)) console.log(`faxios: ${error.name} ${error.code}`);
      throw error;
    }
  },
});

// Cancel the query while its request is in flight.
await fetchStarted.promise;
await queryClient.cancelQueries({ queryKey });

await query.catch((error: unknown) => {
  if (!(error instanceof CancelledError)) throw error;
  console.log("query: cancelled");
});

const state = queryClient.getQueryState(queryKey);
console.log(`state: ${state?.status} ${state?.fetchStatus}`); // state: pending idle
```

## Reading the query error

When a faxios request rejects, the query function rejects with the same error, so TanStack Query stores the faxios error as the query's `error`, the value `useQuery` returns as `error`, and the promise `queryClient.query` returned rejects with it. A query function can reject with errors that aren't faxios errors too, such as an error your own code in it throws, so narrow the error before you read faxios fields: `isFaxiosError(error)` checks the faxios brand, so it also matches an error from another copy of faxios, and `error instanceof FaxiosError` works when only one copy is loaded.

Build what you show from `status` and `code`. The error's `config`, `request` and `response` hold the request's headers, credentials included, and the response body, and `message` can name the request URL; see [Error handling](/pages/advanced/error-handling) for the codes and for logging. Log `error.toJSON()`, not the error: a logger that prints the error's own fields (`console.log(error)` in Node, many structured loggers) prints its `config` with the credentials. `toJSON()` masks the `authorization`, `proxy-authorization`, `cookie` and `auth` values, and other secrets such as an API key header or a token in `params` only when you list their keys in `redact`. A secret written into the `url` string itself, such as `?token=…`, stays in the logged `config.url`, so pass it in `params` instead. This example turns TanStack Query's retries off with `retry: false`, so the error comes from a single request; see [Choosing one retry owner](#choosing-one-retry-owner) for which layer should retry a failed query:

```ts status=404 expect=request:GET%20https://api.example.com/users/42,log:Request%20failed%20with%20404%20ERR_BAD_REQUEST,log:same%20error%3A%20true,log:Something%20went%20wrong
import faxios, { isFaxiosError } from "@gcmdev/faxios";
import { QueryClient } from "@tanstack/query-core";
import { z } from "zod";

const api = faxios.create({ baseURL: "https://api.example.com" });

const getUser = api.define("get", "/users/{id}", {
  pathParamsSchema: z.object({ id: z.string() }),
  responseSchema: z.object({ id: z.string(), name: z.string() }),
});

// A message that is safe to show: only the status and the code, never headers or bodies.
function errorMessage(error: unknown): string {
  if (isFaxiosError(error)) {
    return error.status === undefined
      ? `Request failed with ${error.code}`
      : `Request failed with ${error.status} ${error.code}`;
  }
  // Anything else the query function threw.
  return "Something went wrong";
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const userKey = [ "user", "42" ];
const rejected = await queryClient
  .query({
    queryKey: userKey,
    queryFn: async ({ signal }) => (await getUser({ pathParams: { id: "42" }, signal })).data,
  })
  .catch((reason: unknown) => reason);

// The query's error state: what `useQuery` returns as `error`.
const { error } = queryClient.getQueryState(userKey) ?? {};
console.log(errorMessage(error)); // Request failed with 404 ERR_BAD_REQUEST
// `queryClient.query` rejected with that same error object.
console.log(`same error: ${rejected === error}`); // same error: true

const settingsKey = [ "settings" ];
await queryClient
  .query({
    queryKey: settingsKey,
    queryFn: async (): Promise<string> => {
      throw new Error("No saved settings");
    },
  })
  .catch(() => {});

console.log(errorMessage(queryClient.getQueryState(settingsKey)?.error)); // Something went wrong
```

TanStack Query types `error` as `Error | null`, so a guard such as `isFaxiosError` is what gives it the faxios type. To type every query error as a `FaxiosError` instead, declare `defaultError` on TanStack Query's `Register` interface. Augment the module you install (`@tanstack/react-query` for the React adapter, or `@tanstack/query-core`, which covers every adapter); do this only when every query function rejects with faxios errors alone, because the type doesn't check what a query function throws:

```ts check=skip reason=signature
import type { FaxiosError } from "@gcmdev/faxios";

declare module "@tanstack/query-core" {
  interface Register {
    defaultError: FaxiosError;
  }
}
```

## Choosing one retry owner

TanStack Query and the faxios [`retry` plugin](/pages/plugins/retry) can both retry a failed request, so give each query exactly one retry owner:

- **TanStack Query**, when the faxios instance doesn't install the `retry` plugin. It runs the whole query function again after any rejection, a 404 or a schema validation error included, unless a `retry` function you pass says otherwise. Set `retry` yourself, because the default depends on the API: observers such as `useQuery` retry 3 times in the browser and not at all on the server, while `queryClient.query` (and the deprecated `fetchQuery`) doesn't retry unless `retry` is set. See TanStack Query's [query retries](https://tanstack.com/query/latest/docs/framework/react/guides/query-retries) guide for `retry` and `retryDelay`.
- **The faxios `retry` plugin**, when the `QueryClient` or the query sets `retry: false`. It retries inside one call of the query function, and only what the plugin retries: network errors, timeouts and transient statuses such as 503, for idempotent methods, honouring `Retry-After`.

::: warning Enabling both multiplies attempts
With both on, every TanStack Query attempt can run all of the plugin's attempts, so a query that keeps failing with an error the plugin retries sends up to TanStack Query's attempts times faxios's `attempts` requests: `retry: 2` (three TanStack Query attempts) with the plugin's default of 3 `attempts` sends 9 requests for a GET that keeps getting a 503, to a server that is already failing. See [Retry and error recovery](/pages/plugins/retry) for what the plugin retries and for its `attempts` and backoff options.
:::

None of the other examples on this page installs the `retry` plugin or turns on TanStack Query's retries, so their `queryClient.query` calls don't retry at all; the error example sets `retry: false` to make that explicit.

### TanStack Query retries

This instance has no `retry` plugin, and the `QueryClient` sets `retry: 2`, so a query that keeps failing makes three attempts of one request each. The example counts the requests its `fetch` sends:

```ts status=503 expect=request:GET%20https://api.example.com/users/42,log:query%20attempts%3A%203%2C%20requests%3A%203
import faxios from "@gcmdev/faxios";
import { QueryClient } from "@tanstack/query-core";
import { z } from "zod";

let requests = 0;

// No `retry` plugin: TanStack Query owns retries for this instance.
const api = faxios.create({
  baseURL: "https://api.example.com",
  // Counts every request this example sends, then sends it.
  env: {
    fetch: async (input, init) => {
      requests += 1;
      return fetch(input, init);
    },
  },
});

const getUser = api.define("get", "/users/{id}", {
  pathParamsSchema: z.object({ id: z.string() }),
  responseSchema: z.object({ id: z.string(), name: z.string() }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    // TanStack Query is the retry owner: up to 2 retries, so 3 attempts in all.
    // `retryDelay: 0` retries at once for this example; keep TanStack Query's backoff in an app.
    queries: { retry: 2, retryDelay: 0 },
  },
});

const userKey = [ "user", "42" ];
await queryClient
  .query({
    queryKey: userKey,
    queryFn: async ({ signal }) => (await getUser({ pathParams: { id: "42" }, signal })).data,
  })
  .catch(() => {});

// Every attempt failed with the 503, so the query's failure count is its attempt count.
const attempts = queryClient.getQueryState(userKey)?.fetchFailureCount;
console.log(`query attempts: ${attempts}, requests: ${requests}`); // query attempts: 3, requests: 3
```

### The faxios `retry` plugin retries

This instance installs the `retry` plugin with its default of 3 `attempts`, and the `QueryClient` sets `retry: false`, so a query that keeps failing makes one attempt, and the plugin sends its request three times inside it:

```ts status=503 expect=request:GET%20https://api.example.com/users/42,log:query%20attempts%3A%201%2C%20requests%3A%203
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";
import { QueryClient } from "@tanstack/query-core";
import { z } from "zod";

let requests = 0;

// The `retry` plugin owns retries for this instance, with its default of 3 attempts.
const api = faxios.create({
  baseURL: "https://api.example.com",
  // Counts every request this example sends, then sends it.
  env: {
    fetch: async (input, init) => {
      requests += 1;
      return fetch(input, init);
    },
  },
}).use(
  // `delay: 0` retries at once for this example; keep the plugin's backoff in an app.
  retry({ delay: 0 }),
);

const getUser = api.define("get", "/users/{id}", {
  pathParamsSchema: z.object({ id: z.string() }),
  responseSchema: z.object({ id: z.string(), name: z.string() }),
});

const queryClient = new QueryClient({
  // queryClient.query already doesn't retry; `retry: false` stops observers such as
  // useQuery from retrying on top of the plugin, so a failing query makes one attempt.
  defaultOptions: { queries: { retry: false } },
});

const userKey = [ "user", "42" ];
await queryClient
  .query({
    queryKey: userKey,
    queryFn: async ({ signal }) => (await getUser({ pathParams: { id: "42" }, signal })).data,
  })
  .catch(() => {});

// The query failed once, after the plugin's 3 requests.
const attempts = queryClient.getQueryState(userKey)?.fetchFailureCount;
console.log(`query attempts: ${attempts}, requests: ${requests}`); // query attempts: 1, requests: 3
```

## Infinite queries

An infinite query loads a list one page at a time. TanStack Query keeps the pagination state: the pages loaded so far, the page param each one was fetched with, and whether there is a next page. faxios keeps none of it: each call of the query function is one ordinary request, built from the `pageParam` TanStack Query passes in, here mapped to the typed `page` query param of a `define()` endpoint. `getNextPageParam` gets the last page with the endpoint's inferred response type and returns the next page's param, or `undefined` when there are no more pages.

`InfiniteQueryObserver` is the query-core primitive that `useInfiniteQuery` wraps: `refetch` loads the first page, and `fetchNextPage` adds the next one while `hasNextPage` is true. Both resolve with the error in the result when a page fails, and `hasNextPage` still describes the last page that loaded, so a loop over them passes `throwOnError: true` to stop at the first failed page. This instance has no `retry` plugin and the `QueryClient` sets `retry: false`, so a failed page fails the query after one request; without it, an observer retries 3 times in the browser:

```ts expect=request:GET%20https://api.example.com/users%3Fpage%3D1%0A,request:GET%20https://api.example.com/users%3Fpage%3D2%0A,log:page%20params%3A%201%2C%202%3B%20users%3A%20Ada%2C%20Grace%2C%20Linus%3B%20has%20next%20page%3A%20false
import faxios from "@gcmdev/faxios";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/query-core";
import { z } from "zod";

// The pages the API in this example answers with, by their `page` query param.
const userPages: Record<string, { users: Array<string>; nextPage: number | null; }> = {
  1: { users: [ "Ada", "Grace" ], nextPage: 2 },
  2: { users: [ "Linus" ], nextPage: null },
};

const api = faxios.create({
  baseURL: "https://api.example.com",
  // Stands in for the API: it sends each request on, then answers with the page it asked for.
  env: {
    fetch: async (input, init) => {
      const request = new Request(input, init);
      await fetch(request);
      return Response.json(userPages[new URL(request.url).searchParams.get("page") ?? ""]);
    },
  },
});

const listUsers = api.define("get", "/users", {
  paramsSchema: z.object({ page: z.number() }),
  responseSchema: z.object({ users: z.array(z.string()), nextPage: z.number().nullable() }),
});

const queryClient = new QueryClient({
  // No retry owner: a failed page fails the query after one request.
  defaultOptions: { queries: { retry: false } },
});

const observer = new InfiniteQueryObserver(queryClient, {
  queryKey: [ "users" ],
  // `pageParam` is typed from `initialPageParam` and `getNextPageParam`: a number here.
  queryFn: async ({ pageParam, signal }) => (await listUsers({ params: { page: pageParam }, signal })).data,
  initialPageParam: 1,
  // `lastPage` has the endpoint's inferred response type.
  getNextPageParam: lastPage => lastPage.nextPage ?? undefined,
});

// `throwOnError` rejects on a failed page, so the loop can't keep asking for it.
await observer.refetch({ throwOnError: true });
let result = observer.getCurrentResult();
while (result.hasNextPage) result = await observer.fetchNextPage({ throwOnError: true });

const { pageParams = [], pages = [] } = result.data ?? {};
const users: Array<string> = pages.flatMap(page => page.users);
// @ts-expect-error TS2322 -- each page has the endpoint's response type, so `nextPage` isn't a string
const wrong: Array<{ nextPage: string; }> = pages;
console.log(`page params: ${pageParams.join(", ")}; users: ${users.join(", ")}; has next page: ${result.hasNextPage}`);
// page params: 1, 2; users: Ada, Grace, Linus; has next page: false
```

The same `queryKey`, `queryFn`, `initialPageParam` and `getNextPageParam` options work unchanged with `useInfiniteQuery` in a framework adapter such as `@tanstack/react-query`, which returns the same `data`, `hasNextPage` and `fetchNextPage`. To load pages without an observer, `queryClient.infiniteQuery` takes the same options and resolves with the `{ pages, pageParams }` data.
