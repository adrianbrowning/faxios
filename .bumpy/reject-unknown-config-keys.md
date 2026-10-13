---
"@gcmdev/faxios": minor
---

Breaking: Reject request config keys that are neither faxios options nor declared by an installed plugin with `ERR_BAD_OPTION` naming the key, so a typo such as `timout` or an axios option such as `adapter`, `proxy` or `maxRedirects` fails instead of being ignored; removed axios options get a migration hint. Plugins with request options now name them at runtime (`options: { retry: true }`), and `definePlugin`/`FaxiosPlugin` require it. `responseEncoding`, `transitional.advertiseZstdAcceptEncoding`, `responseType: "document"`/`"response"`, `FaxiosError.ERR_DEPRECATED` and the `baseUrl`/`withXsrfToken` misspelling warnings are removed: those options now reject.
