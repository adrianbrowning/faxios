# Cancellation

Starting from v0.22.0 faxios supports AbortController to cancel requests in a clean way. This feature is available in the browser and in Node.js when using a version of faxios that supports AbortController. To cancel a request, you need to create an instance of `AbortController` and pass its `signal` to the request's `signal` option.

```js
import faxios, { isCancel } from "@gcmdev/faxios";

const controller = new AbortController();

faxios
  .get("/foo/bar", {
    signal: controller.signal,
  })
  .then(function (response) {
    //...
  })
  .catch(function (error) {
    if (isCancel(error)) {
      console.log("Request canceled");
    }
  });
// cancel the request
controller.abort();
```

## Cancelling several requests

You can cancel several requests with the same abort controller. If its signal is already aborted at the moment of starting an faxios request, then the request is cancelled immediately, without any attempts to make a real request.

```js
import faxios, { isCancel } from "@gcmdev/faxios";

const controller = new AbortController();

/** @param {unknown} error */
function handleError(error) {
  if (isCancel(error)) {
    console.log("Request canceled");
  } else {
    // handle error
  }
}

faxios.get("/user/12345", { signal: controller.signal }).catch(handleError);
faxios
  .post("/user/12345", { name: "new name" }, { signal: controller.signal })
  .catch(handleError);

// cancel both requests
controller.abort();
```
