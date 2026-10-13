// Up to the `@` of a URL's user info: after the scheme (`http:`, with any slashes) or after `//`.
// Backslashes count as slashes, as they do in the WHATWG URL parser.
const USER_INFO = /^([a-z][a-z\d+\-.]*:[/\\]*|[/\\]{2})[^/\\?#]*@/i;

/** `url` without the `user:pass@` of its authority, so it is safe to log. */
export default function stripUserInfo(url: string): string {
  return url.replace(USER_INFO, "$1");
}
