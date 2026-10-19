# Plugins

A plugin is middleware with a name, plus optional capabilities it provides to other plugins and request options it adds. You install one with `use()`, like any middleware; see [Middleware](/pages/advanced/middleware) for `use()`, ordering and the context. To build your own, see [Writing a plugin](/pages/plugins/writing-a-plugin).

## Built-in plugins

faxios ships four plugins. Each one has its own entry point, which exports the plugin and its types. Neither the package root nor `@gcmdev/faxios/plugins` re-exports them, and there is no `faxios.plugins` property.

| Plugin | Import | Adds |
| --- | --- | --- |
| [`authBearer`](/pages/plugins/auth-bearer) | `import { authBearer } from "@gcmdev/faxios/plugins/auth-bearer"` | the `auth` capability |
| [`forwardTo`](/pages/plugins/forward-to) | `import { forwardTo } from "@gcmdev/faxios/plugins/forward-to"` | the `forward` request option |
| [`retry`](/pages/plugins/retry) | `import { retry } from "@gcmdev/faxios/plugins/retry"` | the `retry` request option |
| [`timing`](/pages/plugins/timing) | `import { timing } from "@gcmdev/faxios/plugins/timing"` | nothing |

## Ordering

Middleware runs in the order it is installed, so where each plugin sits matters:

- Install `timing` before `retry` to measure all tries together, or after it to measure each try.
- Install `retry` before `authBearer` and the token is fetched again on every try.

Each plugin's page covers how it works with the others.
