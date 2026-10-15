// @ts-self-types="./isAbsoluteURL.d.ts" — required for Deno: published as an unsafe/* export
"use strict";

// A scheme (RFC 3986 §3.1) followed by `//`, as in axios. A scheme alone isn't enough: a relative
// path whose first segment has a colon (`documents:batchGet`, `localhost:3000/x`) parses as a URL.
// ponytail: protocol-relative URLs (//) intentionally not supported — HTTPS-era fork
const ABSOLUTE_URL = /^[a-z][a-z\d+\-.]*:\/\//i;

export default function isAbsoluteURL(url: unknown): boolean {
  return typeof url === "string" && ABSOLUTE_URL.test(url);
}
