---
"@gcmdev/faxios": minor
---

Breaking: state TypeScript 5.4 as the minimum version, since the shipped declarations use `NoInfer` and fail to compile on 4.7 to 5.3, and check the declarations against TypeScript 5.4 in CI. Upgrade TypeScript to 5.4 or later.
