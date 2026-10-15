import platform from "../platform.js";

// The page origin is parsed only in a browser: elsewhere every URL counts as same-origin, so
// importing this module does no URL work.
export default platform.hasStandardBrowserEnv
  ? (() => {
    const pageOrigin = new URL(platform.origin);
    return (url: string) => {
      const _url = new URL(url, platform.origin);

      return pageOrigin.protocol === _url.protocol && pageOrigin.host === _url.host && pageOrigin.port === _url.port;
    };
  })()
  : () => true;
