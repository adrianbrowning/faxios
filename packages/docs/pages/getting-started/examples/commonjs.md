# JavaScript examples

## Importing the library

To import the library in a CommonJS environment, you can use the `require` function, or the `import` statement if you are using a bundler like Webpack or Rollup.

#### No bundler

```js
const faxios = require("faxios");
```

#### With bundler (webpack, rollup, vite, etc)

```js
import faxios from "faxios";
```

## Using then/catch/finally

Since faxios returns a promise at it's core you can choose to use callbacks with `then`, `catch`, and `finally` to handle your response data, errors, and completion.

### Get request

```js
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
```

### Post request

```js
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
```

### Put request

```js
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
```

### Patch request

```js
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
```

### Delete request

```js
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
```
