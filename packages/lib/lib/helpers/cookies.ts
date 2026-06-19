import platform from "../platform/index.js";
import utils from "../utils.js";

type CookieManager = {
  write: (name: string, value: string, expires?: number, path?: string, domain?: string, secure?: boolean, sameSite?: string) => void;
  read: (name: string) => string | null;
  remove: (name: string) => void;
};

const _globalThis = globalThis as { document?: { cookie?: string; }; };

export default platform.hasStandardBrowserEnv
  ? // Standard browser envs support document.cookie
  {
    write(name: string, value: string, expires?: number, path?: string, domain?: string, secure?: boolean, sameSite?: string) {
      if (!_globalThis.document) return;

      const cookie = [ `${name}=${encodeURIComponent(value)}` ];

      if (utils.isNumber(expires)) {
        cookie.push(`expires=${new Date(expires!).toUTCString()}`);
      }
      if (utils.isString(path)) {
        cookie.push(`path=${path}`);
      }
      if (utils.isString(domain)) {
        cookie.push(`domain=${domain}`);
      }
      if (secure === true) {
        cookie.push("secure");
      }
      if (utils.isString(sameSite)) {
        cookie.push(`SameSite=${sameSite}`);
      }

      _globalThis.document.cookie = cookie.join("; ");
    },

    read(name: string): string | null {
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
          return decodeURIComponent(cookie.slice(eq + 1));
        }
      }
      return null;
    },

    remove(name: string) {
      this.write(name, "", Date.now() - 86400000, "/");
    },
  } satisfies CookieManager
  : // Non-standard browser env (web workers, react-native) lack needed support.
  {
    write() {},
    read(): null {
      return null;
    },
    remove() {},
  } satisfies CookieManager;
