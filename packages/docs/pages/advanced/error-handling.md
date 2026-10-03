# Error handling

faxios may throw many different types of errors. Some of these errors are caused by faxios itself, while others are caused by the server or the client. The following table lists the general structure of the thrown error:

| Property | Definition                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| message  | A quick summary of the error message and the status it failed with.                                                                           |
| name     | This defines where the error originated from. For faxios, it will always be an `FaxiosError`.                                                   |
| stack    | Provides the stack trace of the error.                                                                                                        |
| config   | An faxios config object with specific instance configurations defined by the user from when the request was made.                              |
| code     | Represents an faxios identified error. The table below lists out specific definitions for internal faxios error.                                |
| status   | HTTP response status code. See [here](https://en.wikipedia.org/wiki/List_of_HTTP_status_codes) for common HTTP response status code meanings. |

Below is a list of potential faxios identified error

| Code                      | Definition                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| ERR_BAD_OPTION_VALUE      | Invalid or unsupported value provided in faxios configuration.                                 |
| ERR_BAD_OPTION            | Invalid option provided in faxios configuration.                                               |
| ECONNABORTED              | Exported as `FaxiosError.ECONNABORTED`, but faxios does not currently raise it. Timeouts reject with `ETIMEDOUT` and aborts with `ERR_CANCELED`. |
| ETIMEDOUT                 | Request timed out because it exceeded its configured `timeout`. |
| ERR_NETWORK               | Network-related issue, including connection failures such as `ECONNREFUSED`. The underlying transport error (e.g. the OS error) is available on `error.cause`. In the browser, this error can also be caused by a [CORS](https://developer.mozilla.org/ru/docs/Web/HTTP/Guides/CORS) or [Mixed Content](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content) policy violation. The browser does not allow the JS code to clarify the real reason for the error caused by security issues, so please check the console. |
| ERR_FR_TOO_MANY_REDIRECTS | Exported as `FaxiosError.ERR_FR_TOO_MANY_REDIRECTS`, but faxios does not currently raise it. Redirects are followed by `fetch`, which applies its own limit. |
| ERR_DEPRECATED            | Deprecated feature or method used in faxios.                                                   |
| ERR_BAD_RESPONSE          | Response cannot be parsed properly or is in an unexpected format. Usually related to a response with `5xx` status code. |
| ERR_BAD_REQUEST           | The request has an unexpected format or is missing required parameters. Usually related to a response with `4xx` status code. |
| ERR_CANCELED              | Feature or method is canceled explicitly by the user using an AbortSignal. |
| ERR_NOT_SUPPORT           | Feature or method not supported in the current faxios environment.                             |
| ERR_INVALID_URL           | Invalid URL provided for faxios request.                                                       |
| ERR_FORM_DATA_DEPTH_EXCEEDED | An object exceeds the configured `maxDepth` while serializing `params` or form data. Default limit is 100 levels. See [`paramsSerializer`](/pages/advanced/request-config#paramsserializer) and [`formSerializer`](/pages/advanced/request-config#formserializer). |
| ERR_BAD_RESPONSE_SCHEMA   | `response.data` failed `responseSchema` validation. See [Schema validation](/pages/advanced/schema-validation). |
| ERR_BAD_REQUEST_SCHEMA    | `config.data` failed `requestSchema` validation. |
| ERR_BAD_PARAMS_SCHEMA     | `config.params` failed `paramsSchema` validation. |
| ERR_BAD_PATH_PARAMS_SCHEMA | `config.pathParams` failed `pathParamsSchema` validation. |

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

To avoid logging secrets from `error.config`, pass a `redact` array in the request config. Matching config keys are masked case-insensitively at any depth when `FaxiosError#toJSON()` is called.

```js status=404
import faxios from "@gcmdev/faxios";

faxios.get("/user/12345", {
  headers: { Authorization: "Bearer token" },
  redact: ["authorization"]
}).catch(function (error) {
  console.log(error.toJSON().config.headers.Authorization); // [REDACTED ****]
});
```

## Handling timeouts

When a request exceeds its configured `timeout`, faxios rejects with a `FaxiosError` whose `code` is `ETIMEDOUT`. Aborting through an `AbortSignal` rejects with `ERR_CANCELED` instead, so the two are easy to tell apart.

```js
import faxios, { FaxiosError } from "@gcmdev/faxios";

async function fetchWithTimeout() {
  try {
    const response = await faxios.get("https://example.com/data", {
      timeout: 5000, // 5 seconds
    });

    console.log("Response:", response.data);
  } catch (error) {
    if (error instanceof FaxiosError) {
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
