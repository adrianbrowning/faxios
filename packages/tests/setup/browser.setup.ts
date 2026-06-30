/// <reference lib="dom" />
import { afterEach } from "vitest";

// Polyfill Symbol.dispose for browsers that don't support explicit resource management (webkit)
(Symbol as unknown as Record<string | symbol, unknown>)["dispose"] ??= Symbol.for("Symbol.dispose");

afterEach(() => {
  document.body.innerHTML = "";
});
