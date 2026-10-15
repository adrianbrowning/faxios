import platform from "../platform.js";

const pageOrigin = new URL(platform.origin);

export default platform.hasStandardBrowserEnv
  ? (url: string) => {
    const _url = new URL(url, platform.origin);

    return pageOrigin.protocol === _url.protocol && pageOrigin.host === _url.host && pageOrigin.port === _url.port;
  }
  : () => true;
