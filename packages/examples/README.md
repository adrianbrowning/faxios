# faxios examples

Each example page loads faxios as an ES module (`<script type="module">` with an import map for `@gcmdev/faxios`) from the local build in `packages/lib/dist`, which the examples server serves under `/faxios/`. faxios ships no UMD or minified bundle.

To run the examples:

1. `git clone https://github.com/adrianbrowning/faxios.git`
2. `cd faxios`
3. `pnpm install --frozen-lockfile`
4. `pnpm run build`
5. `pnpm run examples`
6. [http://localhost:3000](http://localhost:3000)
