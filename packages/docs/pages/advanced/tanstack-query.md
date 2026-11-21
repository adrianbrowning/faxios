# TanStack Query

[TanStack Query](https://tanstack.com/query/latest) and faxios do different jobs, and they work together without an adapter:

- **TanStack Query owns server state and the UI lifecycle:** caching by query key, deduplicating requests, background refetching, stale and garbage-collection timing, retries, and what a component shows while data loads.
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

Build what you show from `status` and `code`. The error's `config`, `request` and `response` hold the request's headers, credentials included, and the response body, and `message` can name the request URL; see [Error handling](/pages/advanced/error-handling) for the codes and for `toJSON()`, which masks the `authorization`, `proxy-authorization`, `cookie` and `auth` values when you log an error, and other secrets such as an API key header or a token in `params` only when you list their keys in `redact`. This example turns TanStack Query's retries off with `retry: false`, so the error comes from a single request; which layer retries a failed query is owned by the retry section of this guide:

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
