import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "../../../lib/eslint-rules/remove-signal-listeners.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: "latest", sourceType: "module" } });

ruleTester.run("remove-signal-listeners", rule, {
  valid: [
    {
      name: "listener removed in finally",
      code: `
        async function send(signal, request) {
          const onAbort = () => controller.abort(signal.reason);
          signal.addEventListener("abort", onAbort);
          try { return await fetch(request); }
          finally { signal.removeEventListener("abort", onAbort); }
        }`,
    },
    {
      name: "listeners removed by an unsubscribe function",
      code: `
        const compose = signals => {
          const onabort = () => { unsubscribe(); controller.abort(); };
          const unsubscribe = () => signals.forEach(s => s.removeEventListener("abort", onabort));
          signals.forEach(s => s.addEventListener("abort", onabort));
          return unsubscribe;
        };`,
    },
    {
      name: "a { signal } option removes the listener",
      code: `signal.addEventListener("abort", () => reader.cancel(), { signal: done.signal });`,
    },
    {
      name: "other events are out of scope",
      code: `globalThis.addEventListener("message", onMessage);`,
    },
  ],
  invalid: [
    {
      name: "named listener never removed",
      code: `async function send(signal, request) { signal.addEventListener("abort", onAbort); return fetch(request); }`,
      errors: [{ messageId: "leaked" }],
    },
    {
      name: "inline listener can never be removed",
      code: `signal.addEventListener("abort", () => controller.abort());`,
      errors: [{ messageId: "inline" }],
    },
    {
      name: "{ once: true } still leaks when the request settles first",
      code: `signal.addEventListener("abort", onAbort, { once: true });`,
      errors: [{ messageId: "leaked" }],
    },
    {
      name: "removing a different handler does not count",
      code: `
        signal.addEventListener("abort", onAbort);
        signal.removeEventListener("abort", onTimeout);`,
      errors: [{ messageId: "leaked" }],
    },
    {
      name: "removing the handler from a different signal does not count",
      code: `
        a.addEventListener("abort", onAbort);
        b.removeEventListener("abort", onAbort);`,
      errors: [{ messageId: "leaked" }],
    },
  ],
});
