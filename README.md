# faxios

faxios is a promise-based HTTP client for the browser, Node.js, Deno and Bun, published as [`@gcmdev/faxios`](https://www.npmjs.com/package/@gcmdev/faxios). It is a TypeScript-first fork of [axios](https://github.com/axios/axios) that keeps the familiar request API but drops the per-runtime adapters: the web-standard [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) API is its only transport in every runtime.

## Supported platforms

- ESM only. There is no CommonJS build, so load it with `import`, not `require()`.
- Node.js 24 or later, using the `fetch` built into Node.js.
- Browsers, Deno and Bun, through their own `fetch`.
- TypeScript definitions are included in the package.

## Install

```bash
npm install @gcmdev/faxios
```

## Example

```ts file=packages/tests/docs-examples/sources/landing-readme.ts
import faxios from "@gcmdev/faxios";

const { data, status } = await faxios.get("https://api.example.com/users/1");
console.log(status, data);
```

## Documentation

- [Documentation site](https://adrianbrowning.github.io/faxios/): guides and the full API.
- [Package README](packages/lib/README.md): features, installation and examples, as published to npm.
- [Changelog](packages/lib/CHANGELOG.md): what changed in each release.
- [Migration guide](MIGRATION_GUIDE.md): moving from axios.

## Support

- Report bugs and request features in the [issue tracker](https://github.com/adrianbrowning/faxios/issues).
- Report security vulnerabilities privately through a [GitHub security advisory](https://github.com/adrianbrowning/faxios/security/advisories/new), never in a public issue. [SECURITY.md](SECURITY.md) covers supported versions and the disclosure policy.

## Contributing

Read the [contributing guide](CONTRIBUTING.md) before opening a pull request, and follow the [code of conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
