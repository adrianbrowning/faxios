# Adapters

Adapters allow you to customize the way faxios handles the request data. The only built-in adapter is `fetch`, and the default is `adapter: ['fetch']`. The `fetch` adapter is used in every supported runtime — the browser, Node.js 18+, Deno, and Bun — using the web-standard `fetch` API.

Writing your own adapter lets you fully control how faxios makes a request and processes the response — useful for testing, custom transports, or non-standard environments.

## Built-in adapter

The only built-in adapter is `fetch`. It is selected by default, so you do not normally need to set the `adapter` option. You can set it explicitly if you wish:

```js
// Use the fetch adapter (this is the default)
const instance = faxios.create({ adapter: "fetch" });

// Equivalent, using array form
const instance = faxios.create({ adapter: ["fetch"] });
```

For more details on the `fetch` adapter, see the [Fetch adapter](/pages/advanced/fetch-adapter) page.

## Creating a custom adapter

To create a custom adapter, write a function that accepts a `config` object and returns a Promise that resolves to a valid faxios response object.

```js
import faxios from "faxios";
import { settle } from "faxios/unsafe/core/settle.js";

function myAdapter(config) {
  /**
   * At this point:
   * - config has been merged with defaults
   * - request transformers have run
   * - request interceptors have run
   *
   * The adapter is now responsible for making the request
   * and returning a valid response object.
   */

  return new Promise((resolve, reject) => {
    // Perform your custom request logic here.
    // This example uses the native fetch API as a starting point.
    fetch(config.url, {
      method: config.method?.toUpperCase() ?? "GET",
      headers: config.headers?.toJSON() ?? {},
      body: config.data,
      signal: config.signal,
    })
      .then(async (fetchResponse) => {
        const responseData = await fetchResponse.text();

        const response = {
          data: responseData,
          status: fetchResponse.status,
          statusText: fetchResponse.statusText,
          headers: Object.fromEntries(fetchResponse.headers.entries()),
          config,
          request: null,
        };

        // settle resolves or rejects the promise based on the HTTP status
        settle(resolve, reject, response);

        /**
         * After this point:
         * - response transformers will run
         * - response interceptors will run
         */
      })
      .catch(reject);
  });
}

const instance = faxios.create({ adapter: myAdapter });
```

::: tip
The `settle` helper resolves the promise for 2xx status codes and rejects it for everything else, matching faxios's default behaviour. If you want custom status validation, use the `validateStatus` config option instead.
:::
