---
"@gcmdev/faxios": minor
---

Add the `@gcmdev/faxios/core` entry point: `create()` and the instance API without the axios-compat statics, schema validation or form serialization, and without building the root default instance. Install schema validation with `use(schema())` from the new `@gcmdev/faxios/schema` and form serialization (form bodies, `formSerializer`, nested `params`) with `use(form())` from the new `@gcmdev/faxios/form`. Without them a core instance rejects schema options and `formSerializer` with `ERR_BAD_OPTION`, and form bodies and nested params with `ERR_NOT_SUPPORT`, each naming the entry to install. The root entry installs both features on every instance and behaves as before. The built-in plugins now import `./core`, so a plugin subpath no longer loads the root default instance.
