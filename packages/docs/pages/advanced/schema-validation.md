# Schema validation

faxios can validate request inputs and response data with any [Standard Schema v1](https://standardschema.dev) compliant schema, such as Zod, Valibot, or ArkType. Validation is opt-in: set a schema option on the request, the instance defaults, or a [typed endpoint](/pages/advanced/define).

```ts check=types
import faxios from "@gcmdev/faxios";
import { z } from "zod";

const UserSchema = z.object({ name: z.string(), age: z.number() });

const { data } = await faxios.get("/user/1", { responseSchema: UserSchema });
const user: { name: string; age: number } = data; // inferred from UserSchema
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
import faxios from "@gcmdev/faxios";
import { z } from "zod";

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

Validation runs inside dispatch, so every [`.use()` middleware](/pages/advanced/middleware) sees the config before validation on the way in and the validated response on the way out.

Input validation runs after the middleware has run its code before `next()`, and before `transformRequest`, in this order: `pathParams`, then `params`, then `data`. The first failure rejects the request and nothing is sent.

`responseSchema` runs after `transformResponse` and before the response reaches the middleware. It only runs for responses that pass `validateStatus`; a rejected response is not validated.

Schemas may validate asynchronously.

## Handling validation errors

A validation failure rejects with a `FaxiosError` whose `code` names the field that failed:

| Code | Raised by |
| ---- | --------- |
| `ERR_BAD_RESPONSE_SCHEMA` | `responseSchema` |
| `ERR_BAD_REQUEST_SCHEMA` | `requestSchema` |
| `ERR_BAD_PARAMS_SCHEMA` | `paramsSchema` |
| `ERR_BAD_PATH_PARAMS_SCHEMA` | `pathParamsSchema` |

`error.issues` lists the problems as `{ message, path? }` objects. faxios copies only `message` and `path` from the schema result; any other fields your schema library adds are dropped.

### The unvalidated body

On `ERR_BAD_RESPONSE_SCHEMA`, `error.response` is always present. `error.response.data` is the body the schema rejected: the value after `transformResponse` and before validation, typed `unknown`. faxios replaces `response.data` only when validation passes. On success, `response.data` is the schema output and the pre-validation body is not kept.

On the input codes, `error.config` still holds the caller's original `data`, `params` and `pathParams`, because faxios replaces them with the schema output only after validation passes.

`error.toJSON()` includes `issues` but never serializes `response`, so the unvalidated body does not appear in logged or serialized errors. Read it from `error.response.data` if you need it.

### Narrowing with `isSchemaValidationError`

`isSchemaValidationError` narrows an unknown error to the exported `SchemaValidationError` type. It narrows on `code`, so after checking for `ERR_BAD_RESPONSE_SCHEMA`, `error.response` is typed as present:

```ts
import faxios, { FaxiosError, isSchemaValidationError } from "@gcmdev/faxios";
import { z } from "zod";

const User = z.object({ id: z.number(), name: z.string() });

try {
  await faxios.get("/users/1", { responseSchema: User });
} catch (error) {
  if (isSchemaValidationError(error) && error.code === FaxiosError.ERR_BAD_RESPONSE_SCHEMA) {
    const body: unknown = error.response.data;
    console.log(error.issues, body);
  }
}
```

The same guard covers the input codes:

```ts
import faxios, { isSchemaValidationError } from "@gcmdev/faxios";
import { z } from "zod";

const CreateUserSchema = z.object({ name: z.string().min(1) });
const body = { name: "" }; // fails CreateUserSchema

try {
  await faxios.post("/users", body, { requestSchema: CreateUserSchema });
} catch (error) {
  if (isSchemaValidationError(error)) {
    console.log(error.code, error.issues);
  }
}
```

See [Error handling](/pages/advanced/error-handling) for the other error codes.
