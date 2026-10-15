import assert from "node:assert";
import { describe, it } from "vitest";
import utf8ByteLength from "#src/lib/helpers/utf8ByteLength.js";

describe("helpers::utf8ByteLength", () => {
  it.each([
    [ "empty", "" ],
    [ "ASCII", "hello" ],
    [ "2-byte", "é".repeat(5) ],
    [ "3-byte", "€" ],
    [ "the 1- to 2-byte boundary", "\u007f\u0080" ],
    [ "the 2- to 3-byte boundary", "\u07ff\u0800" ],
    [ "a surrogate pair", "😀" ],
    [ "a lone high surrogate", "a\ud83d" ],
    [ "a lone low surrogate", "\ude00b" ],
    [ "a high surrogate before a non-surrogate", "\ud83dx" ],
    [ "mixed text", "Grüße, 世界 😀!" ],
  ])("matches TextEncoder for %s", (_label, str) => {
    assert.strictEqual(utf8ByteLength(str), new TextEncoder().encode(str).byteLength);
  });
});
