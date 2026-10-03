# Header methods <Badge type="tip" text="New" />

With the introduction of the new `FaxiosHeaders` class, faxios provides a set of methods to manipulate headers. These methods are used to set, get, and delete headers in a more convenient way than directly manipulating the headers object.

## Constructor `new FaxiosHeaders(headers?)`

The `FaxiosHeaders` class constructor accepts an optional object with headers to initialize the instance. The headers object can contain any number of headers, and the keys are case-insensitive.

```ts check=skip
constructor(headers?: Record<string, FaxiosHeaderValue> | FaxiosHeaders | string | null);
```

For convenience, you can pass a string with headers separated by a newline character. The headers are then parsed and added to the instance.

```js
import { FaxiosHeaders } from "@gcmdev/faxios";

const headers = new FaxiosHeaders(`
Host: www.bing.com
User-Agent: curl/7.54.0
Accept: */*`);

console.log(headers);

// Object [FaxiosHeaders] {
//   host: 'www.bing.com',
//   'user-agent': 'curl/7.54.0',
//   accept: '*/*'
// }
```

## Set

The `set` method is used to set headers on the instance of `FaxiosHeaders`. The method can be called with a single header name and value, an object with multiple headers, or a string with headers separated by a newline character. The method also accepts an optional `rewrite` parameter that controls the behaviour of setting the header.

```ts check=skip
set(headerName: string, value: FaxiosHeaderValue, rewrite?: boolean): this;
set(headers?: Record<string, FaxiosHeaderValue> | FaxiosHeaders | string, rewrite?: boolean): this;
```

The rewrite argument controls the overwriting behaviour:

- `false` - do not overwrite if header's value is set (is not undefined)
- `undefined` (default) - overwrite the header unless its value is set to `false` or `null`
- `true` - rewrite anyway

Empty or whitespace-only header names are ignored.

`FaxiosHeaders` keeps the case of the first matching key it sees. You can use this to preserve specific header casing by seeding a key with `undefined` and then setting values later. See [Preserving a specific header case](/pages/advanced/headers#preserving-a-specific-header-case).

## Get

The `get` method is used to retrieve the value of a header. The method can be called with a single header name and an optional parser. Without a parser it returns the raw value. Pass `true` to parse the value into key-value pairs, a function to transform the value, or a regular expression to extract part of the value.

```ts check=skip
get(headerName: string): FaxiosHeaderValue | undefined;
get(headerName: string, parser: true): Record<string, string> | undefined;
get(headerName: string, parser: RegExp): RegExpExecArray | null | undefined;
get<R>(headerName: string, parser: (this: FaxiosHeaders, value: FaxiosHeaderValue, header: string) => R): R | undefined;
```

An example of some of the possible usages of the `get` method is shown below:

```js
import { FaxiosHeaders } from "@gcmdev/faxios";

const headers = new FaxiosHeaders({
  'Content-Type': 'multipart/form-data; boundary=Asrf456BGe4h',
});

console.log(headers.get('Content-Type'));
// multipart/form-data; boundary=Asrf456BGe4h

console.log(headers.get('Content-Type', true)); // parse key-value pairs from a string separated with \s,;= delimiters:
// [Object: null prototype] {
//   'multipart/form-data': undefined,
//    boundary: 'Asrf456BGe4h'
// }

console.log(
  headers.get('Content-Type', (value) => {
    return String(value).replace(/a/g, 'ZZZ');
  })
);
// multipZZZrt/form-dZZZtZZZ; boundZZZry=Asrf456BGe4h

console.log(headers.get('Content-Type', /boundary=(\w+)/)?.[0]);
// boundary=Asrf456BGe4h
```

## Has

The `has` method is used to check if a header exists in the instance of `FaxiosHeaders`. The method can be called with a single header name and an optional matcher.

```ts check=skip
has(header: string, matcher?: string | RegExp | ((this: FaxiosHeaders, value: string, name: string) => boolean)): boolean;
```

:::: info
Returns true if the header is set (has no undefined value).
::::

## Delete

The `delete` method is used to delete a header from the instance of `FaxiosHeaders`. The method can be called with a single header name and an optional matcher.

```ts check=skip
delete(header: string | string[], matcher?: string | RegExp | ((this: FaxiosHeaders, value: string, name: string) => boolean)): boolean;
```

:::: info
Returns true if at least one header has been removed.
::::

## Clear

The `clear` method is used to delete all headers from the instance of `FaxiosHeaders` if nothing is passed. If a matcher is passed, only the headers that match the matcher are removed, in this case, the matcher is used to match against the header name rather than the value.

```ts check=skip
clear(matcher?: string | RegExp | ((this: FaxiosHeaders, value: string, name: string) => boolean)): boolean;
```

:::: info
Returns true if at least one header has been cleared.
::::

## Normalize

If the headers object was changed directly, it can cause duplicates with the same name but in different cases. This method normalizes the headers object by combining duplicate keys into one. faxios uses this method internally after running the request and response transformers. Set format to true for converting headers name to lowercase and capitalize the initial letters (cOntEnt-type => Content-Type) or false to keep the original format.

```js
import { FaxiosHeaders } from "@gcmdev/faxios";

const headers = new FaxiosHeaders({
  foo: '1',
});

headers.Foo = '2';
headers.FOO = '3';

console.log(headers.toJSON()); // [Object: null prototype] { foo: '1', Foo: '2', FOO: '3' }
console.log(headers.normalize().toJSON()); // [Object: null prototype] { foo: '3' }
console.log(headers.normalize(true).toJSON()); // [Object: null prototype] { Foo: '3' }
```

:::: info
Returns `this` for chaining.
::::

## Concat

Merges the instance with targets into a new FaxiosHeaders instance. If the target is a string, it will be parsed as RAW HTTP headers. If the target is a FaxiosHeaders instance, it will be merged with the current instance.

This is useful for case presets when composing headers. For example:

```js
import { FaxiosHeaders } from "@gcmdev/faxios";

const headers = FaxiosHeaders.concat(
  { 'content-type': undefined },
  { 'Content-Type': 'application/octet-stream' }
);

console.log(headers.toJSON()); // [Object: null prototype] { 'content-type': 'application/octet-stream' }
```

```ts check=skip
concat(...targets: Array<FaxiosHeaders | Record<string, FaxiosHeaderValue> | string | undefined | null>): FaxiosHeaders;
```

:::: info
Returns a new FaxiosHeaders instance.
::::

## toJSON

Resolve all internal headers values into a new null prototype object. Headers whose value is `null`, `undefined` or `false` are left out. Set `asStrings` to true to resolve arrays as a string containing all elements, separated by commas.

```ts check=skip
toJSON(asStrings?: boolean): Record<string, unknown>;
```

## From

Returns a new `FaxiosHeaders` instance created from the raw headers passed in, or simply returns the given headers object if it's a `FaxiosHeaders` instance.

```ts check=skip
static from(thing?: FaxiosHeaders | Record<string, FaxiosHeaderValue> | string | null): FaxiosHeaders;
```

## Static concat

Returns a new `FaxiosHeaders` instance created by merging the target objects.

```ts check=skip
static concat(...targets: Array<FaxiosHeaders | Record<string, FaxiosHeaderValue> | string | undefined | null>): FaxiosHeaders;
```

## Shortcuts

The following shortcuts are available:

- `setContentType`, `getContentType`, `hasContentType`
- `setContentLength`, `getContentLength`, `hasContentLength`
- `setAccept`, `getAccept`, `hasAccept`
- `setAcceptEncoding`, `getAcceptEncoding`, `hasAcceptEncoding`
- `setUserAgent`, `getUserAgent`, `hasUserAgent`
- `setAuthorization`, `getAuthorization`, `hasAuthorization`
