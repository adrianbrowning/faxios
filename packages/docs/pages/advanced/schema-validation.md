# Schema validation

faxios can validate request inputs and response data with any [Standard Schema v1](https://standardschema.dev) compliant schema, such as Zod, Valibot, or ArkType. Validation is opt-in: set a schema option on the request, the instance defaults, or a [typed endpoint](/pages/advanced/define).

```ts
import faxios from "@gcmdev/faxios";
import { z } from "zod";

const UserSchema = z.object({ name: z.string(), age: z.number() });

const { data } = await faxios.get("/user/1", { responseSchema: UserSchema });
// data is typed as { name: string; age: number }
```

## Options

| Option | Validates | Error code on failure |
| --- | --- | --- |
| `responseSchema` | `response.data`, after `transformResponse` | `ERR_BAD_RESPONSE_SCHEMA` |
| `requestSchema` | `config.data`, before the request is sent | `ERR_BAD_REQUEST_SCHEMA` |
| `paramsSchema` | `config.params`, before the URL is built | `ERR_BAD_PARAMS_SCHEMA` |
| `pathParamsSchema` | `config.pathParams`, before they are substituted into the URL | `ERR_BAD_PATH_PARAMS_SCHEMA` |

The value a schema returns replaces the value it validated, so schema transforms and defaults apply to what faxios sends or returns.

TypeScript infers `response.data` from the output type of `responseSchema`; you do not need to pass a generic.

## Path parameters

`pathParams` substitutes `{key}` placeholders in the URL. Each value is converted to a string and encoded with `encodeURIComponent`.

```ts
const PathSchema = z.object({ id: z.string() });

await faxios.get("/users/{id}", {
  pathParams: { id: "123" },
  pathParamsSchema: PathSchema,
});
// GET /users/123
```

`pathParams` works without a schema. When `pathParamsSchema` is set, `pathParams` is required: a request without it rejects with `ERR_BAD_OPTION_VALUE`. The schema must return a plain object.

A placeholder with no matching key in `pathParams`, or whose value is `null` or `undefined`, rejects with `ERR_BAD_OPTION_VALUE`.

## When validation runs

Input validation runs after the request interceptors and before `transformRequest`, in this order: `pathParams`, then `params`, then `data`. The first failure rejects the request and nothing is sent.

`responseSchema` runs after `transformResponse` and before the response interceptors. It only runs for responses that pass `validateStatus`; a rejected response is not validated.

Schemas may validate asynchronously.

## Handling validation errors

A validation failure rejects with a `FaxiosError` whose `code` is one of the four schema codes above and whose `issues` property lists the problems as `{ message, path? }` objects. `error.toJSON()` includes `issues`.

For `ERR_BAD_RESPONSE_SCHEMA`, `error.response` is always present and `error.response.data` holds the body as it was before validation (after `transformResponse`).

Use the `isSchemaValidationError` type guard to narrow an unknown error:

```ts
import faxios, { isSchemaValidationError } from "@gcmdev/faxios";

try {
  await faxios.post("/users", body, { requestSchema: CreateUserSchema });
} catch (error) {
  if (isSchemaValidationError(error)) {
    console.log(error.code, error.issues);
  }
}
```

See [Error handling](/pages/advanced/error-handling) for the other error codes.
