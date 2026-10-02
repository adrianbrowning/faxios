# Response schema

Every faxios request resolves to a response object with the following shape. The schema is consistent across both browser and Node.js environments.

```js
{
  // The response data provided by the server.
  // When using `transformResponse`, this will be the result of the last transform.
  data: {},

  // The HTTP status code from the server response (e.g. 200, 404, 500).
  status: 200,

  // The HTTP status message matching the status code (e.g. "OK", "Not Found").
  statusText: "OK",

  // The response headers sent by the server.
  // Header names are lower-cased. You can access them using bracket or dot notation.
  headers: {},

  // The faxios config that was used for this request, including baseURL,
  // headers, timeout, params, and any other options you provided.
  config: {},

  // The underlying request object — the fetch `Request` instance used for this request.
  request: {},
}
```

When using `catch`, or passing a [rejection callback](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then) as the second parameter of `then`, read the response from the `error` object. See [Error handling](/pages/advanced/error-handling).

To validate `data` against a schema, see [Schema validation](/pages/advanced/schema-validation).

## Accessing response fields

In practice you will usually destructure just the parts you need:

```js
const { data, status, headers } = await faxios.get("/api/users/1");

console.log(status);          // 200
console.log(headers["content-type"]); // "application/json; charset=utf-8"
console.log(data);            // { id: 1, name: "Jay", email: "jay@example.com" }
```

## Checking the status code

faxios resolves the promise for any 2xx response and rejects for anything outside that range by default. You can customise this with the `validateStatus` config option:

```js
const response = await faxios.get("/api/resource", {
  validateStatus: (status) => status < 500, // resolve for anything below 500
});
```

## Accessing response headers

All response header names are lower-cased, regardless of how the server sent them:

```js
const response = await faxios.get("/api/resource");

// These are equivalent
const contentType = response.headers["content-type"];
const contentType2 = response.headers.get("content-type");
```
