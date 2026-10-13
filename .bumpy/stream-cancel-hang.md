---
"@gcmdev/faxios": patch
---

Fixed `cancel()` on a `responseType: "stream"` body (and on a tracked upload body) hanging while a read of a stalled source was pending: faxios now cancels the source at once, so the cancel settles and the connection and its lock are released.
