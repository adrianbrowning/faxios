# TanStack Query

[TanStack Query](https://tanstack.com/query/latest) and faxios do different jobs, and they work together without an adapter:

- **TanStack Query owns server state and the UI lifecycle:** caching by query key, deduplicating requests, background refetching, stale and garbage-collection timing, retries, and what a component shows while data loads.
- **faxios is the typed request layer:** it builds and sends the request, applies instance defaults and [middleware](/pages/advanced/middleware), validates with your schemas, and types the response from them.

A faxios endpoint made with [`define()`](/pages/advanced/define) or [`route()`](/pages/advanced/route) is a plain async function, so it is the query function. Return `response.data` from it, and TanStack Query types the query's data with the endpoint's inferred response type.

## A typed query function

The examples on this page use `@tanstack/query-core`, the framework-agnostic core that every TanStack Query adapter is built on:

```bash
npm install @tanstack/query-core
```

`QueryClient.fetchQuery` runs the query function, caches the result under the query key, and resolves with the data. Pass the `signal` TanStack Query gives the query function on to faxios, so a query TanStack Query cancels also cancels its request:

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

const user: { id: string; name: string } = await queryClient.fetchQuery({
  queryKey: [ "user", "42" ],
  queryFn: async ({ signal }) => (await getUser({ pathParams: { id: "42" }, signal })).data,
});

console.log(user.name); // Ada Lovelace
```

The same query function works unchanged with a framework adapter such as `useQuery` in `@tanstack/react-query`, which re-exports the query-core types.
