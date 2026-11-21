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

TanStack Query aborts the query function's `signal` when it cancels a query: when you call `queryClient.cancelQueries`, or when the last observer of a query that is still fetching unsubscribes, as `useQuery` does when its component unmounts. A query function that passes that `signal` to faxios cancels the faxios request with it, so the request rejects with a `CanceledError` (code `ERR_CANCELED`), just as an aborted [`AbortController`](/pages/advanced/cancellation) does. TanStack Query ignores that rejection: the query doesn't turn into an error, and it goes back to the state it had before the fetch started.

```ts expect=log:fetch%3A%20aborted,log:faxios%3A%20CanceledError%20ERR_CANCELED,log:query%3A%20cancelled,log:state%3A%20pending%20idle
import faxios, { isCancel } from "@gcmdev/faxios";
import { QueryClient, isCancelledError } from "@tanstack/query-core";
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
  if (isCancelledError(error)) console.log("query: cancelled");
});

const state = queryClient.getQueryState(queryKey);
console.log(`state: ${state?.status} ${state?.fetchStatus}`); // state: pending idle
```
