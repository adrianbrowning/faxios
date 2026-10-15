---
"@gcmdev/faxios": minor
---

Breaking: remove three no-op legacy items. `transitional.clarifyTimeoutError` is gone, so passing it rejects with `ERR_BAD_OPTION` like any unknown `transitional` key (timeouts already always rejected with `ETIMEDOUT`; delete the option). `FaxiosError.ECONNABORTED` is removed and `"ECONNABORTED"` leaves `FaxiosErrorCode`; faxios never raised it, so check `error.code === "ETIMEDOUT"` for a timeout. The `Cancel` alias is removed from the root exports and the default instance; use `CanceledError`.
