---
"@gcmdev/faxios": minor
---

Breaking: the `@gcmdev/faxios/unsafe/utils.js` subpath is removed; the internal helpers it exposed are not part of the API. Replace its predicates with plain `typeof`/`instanceof` checks (or your own helpers); the URL helpers stay available as `unsafe/helpers/buildURL.js`, `unsafe/helpers/combineURLs.js`, `unsafe/helpers/isAbsoluteURL.js` and `unsafe/core/buildFullPath.js`. A custom `toFormData` visitor now gets only the helpers `FormDataVisitorHelpers` declares (`convertValue`, `defaultVisitor` and `isVisitable`), no longer a copy of every `utils.is*` predicate. Importing faxios in a browser without `setImmediate` no longer adds a permanent `message` listener to the window. The fetch adapter encodes string bodies with the runtime's `TextEncoder` only.
