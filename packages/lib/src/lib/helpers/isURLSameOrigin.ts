import platform from "../platform/index.js";

export default platform.hasStandardBrowserEnv
  ? ((origin, isMSIE) => (url: string) => {
    const _url = new URL(url, platform.origin);

    return (
      origin.protocol === _url.protocol &&
        origin.host === _url.host &&
        (isMSIE || origin.port === _url.port)
    );
  })(
    new URL(platform.origin),
    !!(/(msie|trident)/i.test(platform.navigator?.userAgent ?? ""))
  )
  : () => true;
