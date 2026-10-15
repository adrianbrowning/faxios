# Config defaults

faxios allows you to specify config defaults that will be applied to ever request. You can specify defaults for the `baseURL`, `headers`, `timeout`, and other properties. An example of using config defaults is shown below:

```js
import faxios from "@gcmdev/faxios";

const AUTH_TOKEN = "Bearer my-token";

faxios.defaults.baseURL = "https://jsonplaceholder.typicode.com/posts";
faxios.defaults.headers.common["Authorization"] = AUTH_TOKEN;
faxios.defaults.headers.post["Content-Type"] =
  "application/x-www-form-urlencoded";
```

::: warning Global headers are sent to every host
If your application talks to more than one domain, setting `faxios.defaults.headers.common["Authorization"]` will send the token to **all** of them, including third-party APIs you may not control. Use a [custom instance](#custom-instance-defaults) with a scoped `baseURL` for any client that carries credentials.
:::

## Custom instance defaults

faxios instances are declared with their own defaults when created. These defaults may be overridden by setting properties on the instance's `defaults`. An example of using custom instance defaults is shown below:

```js
import faxios from "@gcmdev/faxios";

const AUTH_TOKEN = "Bearer my-token";

const instance = faxios.create({
  baseURL: "https://jsonplaceholder.typicode.com/posts",
  timeout: 1000,
  headers: { Authorization: "foobar" },
});

instance.defaults.headers["Authorization"] = AUTH_TOKEN;
```

## Config order of precedence

Config will be merged with an order of precedence. The order is as follows, first the library defaults are set (see [`defaults/index.ts`](https://github.com/adrianbrowning/faxios/blob/main/packages/lib/src/lib/defaults/index.ts)), then default properties of the instance, and finally config argument for the request. Later values take precedence over earlier ones. An example of the order of precedence is shown below:

First lets create an instance with the defaults provided by the library. At this point the timeout config value is `0` as is the default for the library. Then we override the timeout default for the instance to `2500` milliseconds, so all requests using this instance will wait 2.5 seconds before timing out. Finally we make a request with a timeout of `5000` milliseconds. This request will wait 5 seconds before timing out.

```js
import faxios from "@gcmdev/faxios";

// Library defaults: timeout is 0
const instance = faxios.create();

// Instance default: every request from this instance times out after 2.5 seconds
instance.defaults.timeout = 2500;

// Request config wins: this request times out after 5 seconds
await instance.get("/longRequest", {
  timeout: 5000,
});
```

### An option set to `undefined`

A request option set to `undefined` counts as not set, so the instance value applies. `instance.request({ url: "/a", timeout: undefined })` keeps the instance's `timeout`, and so do `get()`, `post()` and every other method. The exceptions are `xsrfCookieName` and `xsrfHeaderName`, where `undefined` clears the instance value and turns the XSRF header off for that request.

`validateStatus: undefined` also falls back to the instance's validator, so a `5xx` still rejects. To resolve every status, pass `validateStatus: null`.

### Headers

Headers merge in six levels, lowest precedence first:

1. the instance's `common` group
2. the instance's group for the request method, such as `get`
3. the instance's top-level headers
4. the request's `common` group
5. the request's group for the request method
6. the request's top-level headers

Every request header beats every instance header, whatever group it's in. A request header set to `null` or `undefined` removes the instance's header. Inside one level, the top-level headers beat the groups, so the `Authorization` set above on `instance.defaults.headers` replaces the one from `create()`, but one set on `instance.defaults.headers.common` would not.

An instance made with `instance.create()` layers its headers over the parent's the same way: any child header layer, `common` included, beats every parent layer, and a child method group such as `get` applies to that method only. So a child's `common: { "X-Client": "cli" }` replaces a parent's top-level `X-Client` for every method. The child doesn't inherit the defaults of the parent's plugin request options, such as `retry`, because it has none of the parent's plugins; see [Middleware](/pages/advanced/middleware).

```js expect=request:x-client:%20cli%0A,request:accept:%20text/csv%0A
import faxios from "@gcmdev/faxios";

const api = faxios.create({ headers: { "X-Client": "web", get: { Accept: "application/json" } } });

// Sends X-Client: cli and Accept: text/csv: request headers beat instance headers in any group.
await api.get("/export", { headers: { common: { "X-Client": "cli" }, Accept: "text/csv" } });
```
