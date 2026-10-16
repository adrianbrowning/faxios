// @ts-self-types="./stripUserInfo.d.ts" — required for Deno: index.d.ts re-exports from here

// Up to the `@` of a URL's user info: after the scheme (`http:`, with any slashes) or after `//`.
// Backslashes count as slashes, as they do in the WHATWG URL parser.
const USER_INFO = /^([a-z][a-z\d+\-.]*:[/\\]*|[/\\]{2})[^/\\?#]*@/i;

// `user:pass@` after a `scheme://` anywhere in free text, such as an error message. A match can
// start only at a scheme character followed by `:` and two slashes, and the user info stops at the
// first `/`, so the scan is linear: matching the whole scheme from a word boundary rescanned the
// text from every letter of a long `a.a.a…` path, which took seconds on a 200 kB message.
// The user info runs through the last `@` before a `/`, `?`, `#` or space (`user:p@ss@host`);
// each repeat ends at an `@` and none can contain one, so the repeats can't overlap.
const USER_INFO_IN_TEXT = /([a-z\d+\-.]:[/\\]{2})(?:[^/\\?#\s@]*@)+/gi;

/** `url` without the `user:pass@` of its authority, so it is safe to log. */
export default function stripUserInfo(url: string): string {
  return url.replace(USER_INFO, "$1");
}

/** `text` without the `user:pass@` after each `scheme://` in it, so an error message is safe to log. */
export function stripUserInfoInText(text: string): string {
  return text.replace(USER_INFO_IN_TEXT, "$1");
}
