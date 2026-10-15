# multipart-form-data format

faxios can send requests in the `multipart/form-data` format. This format is commonly used when uploading files. To send a request in this format, you need to create a `FormData` object and append the data to it. Then you can pass the `FormData` object to the `data` property of the faxios request config.

```js
import faxios from '@gcmdev/faxios';

const formData = new FormData();
formData.append('foo', 'bar');

await faxios.post('https://httpbin.org/post', formData);
```

Do not set the `Content-Type` header for a `FormData` body. The runtime picks the multipart boundary when it encodes the body, so faxios removes any `Content-Type` you or a default set (including one with a `boundary` of your own) and the header always carries the boundary the body was encoded with.

The global `FormData` (and `Blob`/`File`) is available in every supported runtime — browsers, Node.js, Deno, and Bun — so the same code works everywhere. The request body must be the runtime's global `FormData`. faxios no longer bundles the `form-data` package, and an instance of the npm `form-data` package (an object with `getHeaders()`) is rejected as a request body with a `FaxiosError` whose code is `ERR_NOT_SUPPORT`, before anything is sent: `fetch` cannot read it.

```js
import faxios from '@gcmdev/faxios';

const fileBytes = new Uint8Array([0xff, 0xd8, 0xff]); // e.g. the contents of bar.jpg

const form = new FormData();
form.append('my_field', 'my value');
form.append('my_file', new Blob([fileBytes]), 'bar.jpg');

await faxios.post('https://example.com', form);
```

## Automatic serialization to FormData <Badge type="tip" text="New" />

faxios supports automatic object serialization to a FormData object if the request Content-Type header is set to multipart/form-data. This means that you can pass a JavaScript object directly to the data property of the faxios request config. For example when passing data to a POST request:

```js
import faxios from '@gcmdev/faxios';

faxios
  .post(
    'https://httpbin.org/post',
    { x: 1 },
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  )
  .then(({ data }) => console.log(data));
```

faxios uses the runtime's global `FormData` for serialization. You can override the class via the `env.FormData` config variable, but you probably won't need it in most cases:

```js
import faxios from '@gcmdev/faxios';

class CustomFormData extends FormData {}

faxios
  .post(
    'https://httpbin.org/post',
    { x: 1 },
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      env: {
        FormData: CustomFormData,
      },
    }
  )
  .then(({ data }) => console.log(data));
```

## Supported endings

faxios FormData serializer supports some special endings to perform the following operations:

- `{}` - serialize the value with JSON.stringify
- `[]` - unwrap the array-like object as separate fields with the same key

::: warning
Note: unwrap/expand operation will be used by default on arrays and FileList objects
:::

## Configuring the FormData serializer

FormData serializer supports additional options via config.formSerializer: object property to handle rare cases:

- `visitor: Function` - user-defined visitor function that will be called recursively to serialize the data object to a FormData object by following custom rules.
- `dots: boolean = false` - use dot notation instead of brackets to serialize arrays and objects;
- `metaTokens: boolean = true` - add the special ending (e.g `user{}: '{"name": "John"}'`) in the FormData key. The back-end body-parser could potentially use this meta-information to automatically parse the value as JSON.
- `indexes: null|false|true = false` - controls how indexes will be added to unwrapped keys of flat array-like objects
  - `null` - don't add brackets (`arr: 1`, `arr: 2`, `arr: 3`)
  - `false` (default) - add empty brackets (`arr[]: 1`, `arr[]: 2`, `arr[]: 3`)
  - `true` - add brackets with indexes (`arr[0]: 1`, `arr[1]: 2`, `arr[2]: 3`)
- `maxDepth: number = 100` - maximum object nesting depth the serializer will recurse into. If the input exceeds this depth, an `FaxiosError` with `code: 'ERR_FORM_DATA_DEPTH_EXCEEDED'` is thrown. This protects server-side applications from DoS attacks via deeply nested payloads. Set to `Infinity` to disable the limit.

```js
import faxios from '@gcmdev/faxios';

const data = { level1: { level2: { level3: 'value' } } };

// Allow deeper nesting for schemas that legitimately exceed 100 levels:
await faxios.postForm('/api', data, { formSerializer: { maxDepth: 200 } });
```

::: warning Security note
The default limit of 100 is intentional. Server-side code that forwards client-controlled JSON to faxios as `data` is vulnerable to a call-stack overflow without this guard. Only raise `maxDepth` if your schema genuinely requires it.
:::

For example, if we have an object like this:

```js
const obj = {
  x: 1,
  arr: [1, 2, 3],
  arr2: [1, [2], 3],
  users: [
    { name: 'Peter', surname: 'Griffin' },
    { name: 'Thomas', surname: 'Anderson' },
  ],
  'obj2{}': [{ x: 1 }],
};
```

The following steps will be executed by the faxios serializer internally:

```js
const formData = new FormData();
formData.append('x', '1');
formData.append('arr[]', '1');
formData.append('arr[]', '2');
formData.append('arr[]', '3');
formData.append('arr2[0]', '1');
formData.append('arr2[1][0]', '2');
formData.append('arr2[2]', '3');
formData.append('users[0][name]', 'Peter');
formData.append('users[0][surname]', 'Griffin');
formData.append('users[1][name]', 'Thomas');
formData.append('users[1][surname]', 'Anderson');
formData.append('obj2{}', '[{"x":1}]');
```

faxios supports the following shortcut methods: `postForm`, `putForm`, `patchForm` which are just the corresponding http methods with the `Content-Type` header preset to `multipart/form-data`.
