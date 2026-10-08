# Pre-Release Changelog

## Unreleased

### Features

- **Go-to-definition lands on TypeScript source, and path params are documented in the types:** the package now ships `src/**/*.ts` and a `.d.ts.map` next to every `.d.ts`, so go-to-definition in an editor opens the `.ts` source instead of the declaration, and the existing `.js.map` files resolve too. `pathParams` and `pathParamsSchema` (on request configs, `define()` endpoint calls and `route()` configs), `define()`, `route()`, `getUri()` and the define/route types now have JSDoc, so hovers say that placeholders are `{key}`, how values are encoded, which errors a missing value or schema failure raises, and that `getUri()` doesn't substitute `pathParams`. (**#147**)

### Fixes

- **The package includes `LICENSE` again:** `@gcmdev/faxios@0.2.0` was published without a `LICENSE` file, so its tarball shipped axios-derived code without the MIT copyright and permission notice. `0.1.0` had one. The file now lives in `packages/lib/LICENSE` as a copy of the root `LICENSE`, and a check fails `lint:ts` and the publish workflow when `npm pack` would leave it out or the copy differs from the root file. The notice also adds a copyright line for the fork under the axios one. (**#160**)

### Documentation

- Fixed middleware docs examples that used `:id` instead of `{id}` path placeholders. (**#146**)
- **Documented wiring `define()`/`route()` on an instance with middleware.** (**#148**)
- Documented downloading binary files with `responseType: "arraybuffer"` and corrected the `responseType` list. (**#149**)
