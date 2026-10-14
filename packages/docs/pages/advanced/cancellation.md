# Cancellation

faxios cancels requests with `AbortController` in every runtime. To cancel a request, you need to create an instance of `AbortController` and pass its `signal` to the request's `signal` option.

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

## Signals from polyfills and other realms

`signal` takes any object with `aborted`, `addEventListener` and `removeEventListener`, such as an `AbortSignal` from a polyfill or from another realm. A value without the listener methods rejects with an `ERR_BAD_OPTION_VALUE` `FaxiosError` before any middleware runs or anything is sent.

## One signal for many requests

A signal can outlive the requests that use it, such as one per page or per app. faxios removes every listener it adds to the signal once each request settles, and a request's own signals stop following it then, so a long-lived signal keeps nothing alive.

## Timeouts and streamed bodies

With `responseType: "stream"`, the request's `signal` and `timeout` stay in force until the body has been read, errors or is cancelled, even when `retry({ attemptTimeout })` gave each try a limit of its own. A try's limit stops once its response arrives; the request's `timeout` keeps running, so a stalled body still rejects with `ETIMEDOUT`. Cancel a body you don't read, so the timer and the signal listener are released.
