# Ejemplos en JavaScript

## Importar la librería

Para importar la librería en un entorno CommonJS, puedes usar la función `require`, o la declaración `import` si estás usando un empaquetador como Webpack o Rollup.

#### Sin empaquetador

```js
const faxios = require("faxios");
```

#### Con empaquetador (webpack, rollup, vite, etc)

```js
import faxios from "faxios";
```

## Usando then/catch/finally

Dado que faxios devuelve una Promise en su núcleo, puedes optar por usar callbacks con `then`, `catch` y `finally` para manejar los datos de la respuesta, los errores y la finalización.

### Solicitud Get

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

### Solicitud Post

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

### Solicitud Put

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

### Solicitud Patch

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

### Solicitud Delete

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

## Usando async/await

Otra forma de manejar promises es mediante `async` y `await`. Esto te permite usar bloques try/catch/finally para manejar errores y la finalización. Esto puede hacer tu código más legible y fácil de entender, y también ayuda a evitar el llamado "callback hell".

::: tip
Nota: async/await forma parte de ECMAScript 2017 y no está disponible en Internet Explorer ni en navegadores más antiguos, así que úsalo con precaución.
:::

### Solicitud Get

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

### Solicitud Post

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

### Solicitud Put

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

### Solicitud Patch

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

### Solicitud Delete

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
