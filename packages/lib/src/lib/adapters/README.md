# faxios // adapters

The modules under `adapters/` contain the web-standard `fetch` adapter, which is the only HTTP transport faxios uses in every runtime (browser, Node 18+, Deno, Bun).

Custom user-supplied adapters are not supported. The `fetch` adapter is the fixed, unconditional transport.
