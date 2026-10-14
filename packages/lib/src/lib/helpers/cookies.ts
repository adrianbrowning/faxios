import platform from "../platform.js";

type CookieReader = {
  read: (name: string) => null | string;
};

const _globalThis = globalThis as { document?: { cookie?: string; }; };

export default platform.hasStandardBrowserEnv
  ? // Standard browser envs support document.cookie
  {
    read(name: string): null | string {
      if (!_globalThis.document) return null;
      // Match name=value by splitting on the semicolon separator instead of building a
      // RegExp from `name` — interpolating an unescaped string into a RegExp would let
      // metacharacters (e.g. `.+?` in an attacker-influenced cookie name) cause ReDoS or
      // match the wrong cookie. Browsers may serialize cookie pairs as either ";" or
      // "; ", so ignore optional whitespace before each cookie name.
      const cookies = (_globalThis.document.cookie ?? "").split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i]!.replace(/^\s+/, "");
        const eq = cookie.indexOf("=");
        if (eq !== -1 && cookie.slice(0, eq) === name) {
          const value = cookie.slice(eq + 1);
          // A malformed escape (set by other code on the site) is returned as written, not thrown.
          try {
            return decodeURIComponent(value);
          }
          catch {
            return value;
          }
        }
      }
      return null;
    },
  } satisfies CookieReader
  : // Web workers have no document.cookie.
  {
    read(): null {
      return null;
    },
  } satisfies CookieReader;
