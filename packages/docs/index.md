---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: 'faxios docs'
  text: 'A TypeScript-first, fetch-based fork of axios'
  tagline: 'Promise based HTTP client for the browser, Node.js, Deno, and Bun'
  actions:
    - theme: brand
      text: Get started
      link: /pages/getting-started/first-steps
    - theme: alt
      text: API reference
      link: /pages/advanced/api-reference

features:
  - title: One transport everywhere
    details: Every request goes through the web-standard fetch API, in the browser, Node.js, Deno, and Bun.
  - title: Schema validation
    details: Validate request bodies, params, path params, and responses with any Standard Schema library through requestSchema, paramsSchema, pathParamsSchema, and responseSchema.
  - title: Typed endpoints
    details: Describe an endpoint once with faxios.define() or faxios.route() and get typed path params, bodies, and responses at every call site.
---
