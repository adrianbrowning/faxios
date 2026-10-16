---
"@gcmdev/faxios": minor
---

The package root now exports `canceledFromSignal`, `assertSignal`, `onAbort`, `raceAbort` (with the `AbortableSignal` type) and `hasOwnInPrototypeChain`, so plugins reuse core's cancellation, signal and prototype-walk rules instead of copying them. The `retry` plugin uses them, and no longer hangs on a request body that is a `Proxy` whose `getPrototypeOf` makes the prototype chain a cycle.
