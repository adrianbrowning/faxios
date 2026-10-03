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

faxios instances are declared with their own defaults when created. These defaults may be overridden setting the `defaults` property to the instance. An example of using custom instance defaults is shown below:

```js
import faxios from "@gcmdev/faxios";

const AUTH_TOKEN = "Bearer my-token";

const instance = faxios.create({
  baseURL: "https://jsonplaceholder.typicode.com/posts",
  timeout: 1000,
  headers: { Authorization: "foobar" },
});

instance.defaults.headers.common["Authorization"] = AUTH_TOKEN;
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
