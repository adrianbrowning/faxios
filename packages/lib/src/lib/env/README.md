# faxios // env

`data.ts` holds the hard-coded `VERSION` that faxios sends in the User-Agent and error messages. Please do not edit it manually: when `release.yml` runs, `packages/tests/scripts/sync-version.ts` writes the version from `packages/lib/package.json` into it, and `packages/tests/unit/version.test.ts` fails when the two differ.
