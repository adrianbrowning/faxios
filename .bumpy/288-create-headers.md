---
"@gcmdev/faxios": patch
---

`create()` children and `eject()` no longer leave plugin option defaults behind: a child no longer copies the defaults the parent's plugins declared (such as `retry`), and `eject()` removes the defaults for the ejected plugin's options, so requests stop rejecting with `ERR_BAD_OPTION` (`Unknown option retry`). A `create()` child's headers now layer over the parent's the way request headers do: any child header, `common` included, beats every parent header, and a child method group applies to that method only. Requests no longer deep-merge headers only to discard the result.
