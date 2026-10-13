# Error handling

faxios may throw many different types of errors. Some of these errors are caused by faxios itself, while others are caused by the server or the client. The following table lists the general structure of the thrown error:

| Property | Definition                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| message  | A quick summary of the error message and the status it failed with.                                                                           |
| name     | Always `FaxiosError`, including when faxios wraps another error (a `TypeError` from `fetch`, a `SyntaxError` from `JSON.parse`). The wrapped error, with its own `name`, is on `error.cause`. |
| cause    | The error faxios wrapped, when there is one: the runtime's transport error for `ERR_NETWORK`, the `SyntaxError` for invalid JSON, the parse error for `ERR_INVALID_URL`. |
| stack    | Provides the stack trace of the error.                                                                                                        |
| config   | An faxios config object with specific instance configurations defined by the user from when the request was made.                              |
| code     | Represents an faxios identified error. The table below lists out specific definitions for internal faxios error.                                |
| status   | HTTP response status code. See [here](https://en.wikipedia.org/wiki/List_of_HTTP_status_codes) for common HTTP response status code meanings. |

Below is a list of potential faxios identified error

| Code                      | Definition                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| ERR_BAD_OPTION_VALUE      | Invalid or unsupported value provided in faxios configuration. This includes a config that isn't an object (such as `null`), a `method` that isn't a string HTTP method name, a `url` that isn't a string or `URL`, and a `responseType` faxios doesn't support. |
| ERR_BAD_OPTION            | Unknown option provided in faxios configuration: a request config key that is neither a faxios option nor a request option of an installed plugin, or an unknown `transitional` key. The message names the key, and for options removed from axios it says what to use instead. |
| ECONNABORTED              | Exported as `FaxiosError.ECONNABORTED`, but faxios does not currently raise it. Timeouts reject with `ETIMEDOUT` and aborts with `ERR_CANCELED`. |
| ETIMEDOUT                 | Request timed out because it exceeded its configured `timeout`. |
| ERR_NETWORK               | Network-related issue, including connection failures such as `ECONNREFUSED` and a response body that fails while it is being read (for example, the connection is reset mid-body). The message names the underlying reason and the request, such as `Network Error: ECONNREFUSED (GET https://api.example.com/users)`; the URL is shown without its user info, query string and fragment. The underlying transport error (e.g. the OS error) is available on `error.cause`. In the browser, this error can also be caused by a [CORS](https://developer.mozilla.org/ru/docs/Web/HTTP/Guides/CORS) or [Mixed Content](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content) policy violation. The browser does not allow the JS code to clarify the real reason for the error caused by security issues, so the message carries only the browser's text (`Failed to fetch`); check the console. |
| ERR_FR_TOO_MANY_REDIRECTS | Exported as `FaxiosError.ERR_FR_TOO_MANY_REDIRECTS`, but faxios does not currently raise it. Redirects are followed by `fetch`, which applies its own limit. |
| ERR_BAD_RESPONSE          | Response cannot be parsed properly or is in an unexpected format, including a body that isn't valid JSON when `responseType` is `"json"` (the `SyntaxError` is on `error.cause`, the raw body on `error.response.data`). Usually related to a response with `5xx` status code. |
| ERR_BAD_REQUEST           | The request has an unexpected format or is missing required parameters, including a request the runtime refuses to build (for example, a `GET` with a body). Usually related to a response with `4xx` status code. |
| ERR_CANCELED              | Feature or method is canceled explicitly by the user using an AbortSignal. |
| ERR_NOT_SUPPORT           | Feature or method not supported in the current faxios environment.                             |
| ERR_INVALID_URL           | Invalid URL provided for faxios request, including a URL `fetch` can't parse. Outside the browser a relative `url` needs a `baseURL`. The parse error is on `error.cause`. |
| ERR_FORM_DATA_DEPTH_EXCEEDED | An object exceeds the configured `maxDepth` while serializing `params` or form data. Default limit is 100 levels. See [`paramsSerializer`](/pages/advanced/request-config#paramsserializer) and [`formSerializer`](/pages/advanced/request-config#formserializer). |
| ERR_BAD_RESPONSE_SCHEMA   | The response body failed `responseSchema` validation. `error.response` is always set, and `error.response.data` is the rejected body (after `transformResponse`, typed `unknown`). `toJSON()` does not serialize it. See [Schema validation](/pages/advanced/schema-validation#the-unvalidated-body). |
| ERR_BAD_REQUEST_SCHEMA    | `config.data` failed `requestSchema` validation. `error.config.data` is the original, unvalidated value. |
| ERR_BAD_PARAMS_SCHEMA     | `config.params` failed `paramsSchema` validation. `error.config.params` is the original, unvalidated value. |
| ERR_BAD_PATH_PARAMS_SCHEMA | `config.pathParams` failed `pathParamsSchema` validation. `error.config.pathParams` is the original, unvalidated value. |

## Handling errors

The default behaviour of faxios is to reject the promise if the request fails. However, you can also catch the error and handle it as you see fit. Below is an example of how to catch an error:

```js status=404
import faxios from "@gcmdev/faxios";

faxios.get("/user/12345").catch(function (error) {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    console.log(error.response.data);
    console.log(error.response.status);
    console.log(error.response.headers);
  } else if (error.request) {
    // The request was made but no response was received
    // `error.request` is the fetch `Request` instance used for this request
    console.log(error.request);
  } else {
    // Something happened in setting up the request that triggered an Error
    console.log("Error", error.message);
  }
  console.log(error.config);
});
```

Using the `validateStatus` config option, you can override the default condition (status >= 200 && status < 300) and define HTTP code(s) that should throw an error.

```js status=404
import faxios from "@gcmdev/faxios";

faxios.get("/user/12345", {
  validateStatus: function (status) {
    return status < 500; // Resolve only if the status code is less than 500
  },
});
```

Using the `toJSON` method, you can get an object with more information about the error.

```js status=404
import faxios from "@gcmdev/faxios";

faxios.get("/user/12345").catch(function (error) {
  console.log(error.toJSON());
});
```

`toJSON()` never includes the request or the response, and it masks credentials so the result is safe to log: the values of the `authorization`, `proxy-authorization`, `cookie` and `auth` config keys (case-insensitive, at any depth) become `[REDACTED ****]`, and `user:pass@` is stripped from `url` and `baseURL`. To mask other secrets, such as an API key header or a token in `params`, list their keys in a `redact` array in the request config; they're masked the same way.

`toJSON()` also includes `cause`, the chain of wrapped errors as `{ name, code, message, cause }`, so a logged network failure still names the underlying error (for example `{ name: "Error", code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:443" }`). Each entry holds only those fields, never a wrapped error's config, and user info is stripped from URLs in the messages and the stack.

```js status=404
import faxios from "@gcmdev/faxios";

faxios.get("/user/12345", {
  headers: { Authorization: "Bearer token", "X-Api-Key": "key" },
  redact: ["x-api-key"]
}).catch(function (error) {
  const { headers } = error.toJSON().config;
  console.log(headers.Authorization, headers["X-Api-Key"]); // [REDACTED ****] [REDACTED ****]
});
```

The error object itself still holds the full `error.config`. A logger that prints the error's fields instead of calling `toJSON()` (`console.log(error)` in Node, many structured loggers) prints the credentials too, so log `error.toJSON()`.

## Handling timeouts

When a request exceeds its configured `timeout`, faxios rejects with a `FaxiosError` whose `code` is `ETIMEDOUT`. Aborting through an `AbortSignal` rejects with `ERR_CANCELED` instead, so the two are easy to tell apart.

```js
import faxios from "@gcmdev/faxios";

async function fetchWithTimeout() {
  try {
    const response = await faxios.get("https://example.com/data", {
      timeout: 5000, // 5 seconds
    });

    console.log("Response:", response.data);
  } catch (error) {
    if (faxios.isFaxiosError(error)) {
      if (error.code === "ETIMEDOUT") {
        console.error("Request timed out. Please try again.");
        return;
      }

      console.error("faxios error:", error.message);
      return;
    }

    console.error("Unexpected error:", error);
  }
}

await fetchWithTimeout();
```

::: tip Always set a `timeout` in production
Without one, a stalled request can hang indefinitely. See [`timeout`](/pages/advanced/request-config#timeout) for the matching config option.
:::
