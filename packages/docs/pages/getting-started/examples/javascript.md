# JavaScript examples

## Importing the library

faxios is published as an ES module only; there is no CommonJS build. Import it with an `import` statement, in Node.js (an `.mjs` file or a package with `"type": "module"`) or through a bundler such as webpack, Rollup or Vite:

```js
import faxios from "@gcmdev/faxios";
```

## Using then/catch/finally

Since faxios returns a promise at it's core you can choose to use callbacks with `then`, `catch`, and `finally` to handle your response data, errors, and completion.

### Get request

```js
import faxios from "@gcmdev/faxios";

faxios
  .get("https://jsonplaceholder.typicode.com/posts", {
    params: {
      postId: 5,
    },
  })
  .then((response) => {
    console.log(response.data);
  })
  .catch((error) => {
    console.error(error);
  })
  .finally(() => {
    console.log("Request completed");
  });
```

### Post request

```js
import faxios from "@gcmdev/faxios";

faxios
  .post("https://jsonplaceholder.typicode.com/posts", {
    title: "foo",
    body: "bar",
    userId: 1,
  })
  .then((response) => {
    console.log(response.data);
  })
  .catch((error) => {
    console.error(error);
  })
  .finally(() => {
    console.log("Request completed");
  });
```

### Put request

```js
import faxios from "@gcmdev/faxios";

faxios
  .put("https://jsonplaceholder.typicode.com/posts/1", {
    title: "foo",
    body: "bar",
    userId: 1,
  })
  .then((response) => {
    console.log(response.data);
  })
  .catch((error) => {
    console.error(error);
  })
  .finally(() => {
    console.log("Request completed");
  });
```

### Patch request

```js
import faxios from "@gcmdev/faxios";

faxios
  .patch("https://jsonplaceholder.typicode.com/posts/1", {
    title: "foo",
  })
  .then((response) => {
    console.log(response.data);
  })
  .catch((error) => {
    console.error(error);
  })
  .finally(() => {
    console.log("Request completed");
  });
```

### Delete request

```js
import faxios from "@gcmdev/faxios";

faxios
  .delete("https://jsonplaceholder.typicode.com/posts/1")
  .then((response) => {
    console.log(response.data);
  })
  .catch((error) => {
    console.error(error);
  })
  .finally(() => {
    console.log("Request completed");
  });
```

## Using async/await

Another way to handle promises is by using `async` and `await`. This allows you to use try/catch/finally blocks to handle errors and completion. This can make your code more readable and easier to understand, this also helps prevents so called callback hell.

::: tip
Note: async/await is part of ECMAScript 2017 and is not supported in Internet Explorer and older browsers, so use with caution.
:::

### Get request

```js
import faxios from "@gcmdev/faxios";

const getPosts = async () => {
  try {
    const response = await faxios.get(
      "https://jsonplaceholder.typicode.com/posts",
      {
        params: {
          postId: 5,
        },
      }
    );
    console.log(response.data);
  } catch (error) {
    console.error(error);
  } finally {
    console.log("Request completed");
  }
};

await getPosts();
```

### Post request

```js
import faxios from "@gcmdev/faxios";

const createPost = async () => {
  try {
    const response = await faxios.post(
      "https://jsonplaceholder.typicode.com/posts",
      {
        title: "foo",
        body: "bar",
        userId: 1,
      }
    );
    console.log(response.data);
  } catch (error) {
    console.error(error);
  } finally {
    console.log("Request completed");
  }
};

await createPost();
```

### Put request

```js
import faxios from "@gcmdev/faxios";

const updatePost = async () => {
  try {
    const response = await faxios.put(
      "https://jsonplaceholder.typicode.com/posts/1",
      {
        title: "foo",
        body: "bar",
        userId: 1,
      }
    );
    console.log(response.data);
  } catch (error) {
    console.error(error);
  } finally {
    console.log("Request completed");
  }
};

await updatePost();
```

### Patch request

```js
import faxios from "@gcmdev/faxios";

const updatePost = async () => {
  try {
    const response = await faxios.patch(
      "https://jsonplaceholder.typicode.com/posts/1",
      {
        title: "foo",
      }
    );
    console.log(response.data);
  } catch (error) {
    console.error(error);
  } finally {
    console.log("Request completed");
  }
};

await updatePost();
```

### Delete request

```js
import faxios from "@gcmdev/faxios";

const deletePost = async () => {
  try {
    const response = await faxios.delete(
      "https://jsonplaceholder.typicode.com/posts/1"
    );
    console.log(response.data);
  } catch (error) {
    console.error(error);
  } finally {
    console.log("Request completed");
  }
};

await deletePost();
```
