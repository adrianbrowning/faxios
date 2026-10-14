---
"@gcmdev/faxios": minor
---

Breaking: the `@gcmdev/faxios/unsafe/utils.js` subpath is removed; the internal helpers it exposed are not part of the API. A custom `toFormData` visitor now gets only the helpers `FormDataVisitorHelpers` declares (`convertValue`, `defaultVisitor` and `isVisitable`), no longer a copy of every `utils.is*` predicate. Importing faxios in a browser without `setImmediate` no longer adds a permanent `message` listener to the window. The fetch adapter encodes string bodies with the runtime's `TextEncoder` only.
