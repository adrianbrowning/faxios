# Pre-Release Changelog

## Unreleased

### Fixes

- **The package includes `LICENSE` again:** `@gcmdev/faxios@0.2.0` was published without a `LICENSE` file, so its tarball shipped axios-derived code without the MIT copyright and permission notice. `0.1.0` had one. The file now lives in `packages/lib/LICENSE` as a copy of the root `LICENSE`, and a check fails `lint:ts` and the publish workflow when `npm pack` would leave it out or the copy differs from the root file. The notice also adds a copyright line for the fork under the axios one. (**#160**)

### Documentation

- Fixed middleware docs examples that used `:id` instead of `{id}` path placeholders. (**#146**)
- **Documented wiring `define()`/`route()` on an instance with middleware.** (**#148**)
