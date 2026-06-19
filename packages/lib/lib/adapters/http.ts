import { EventEmitter } from "node:events";
import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import type net from "node:net";
import { resolve as resolvePath } from "node:path";
import stream from "node:stream";
import util from "node:util";
import zlib from "node:zlib";
import followRedirects from "follow-redirects";
import createHttpsProxyAgent from "https-proxy-agent";
import { getProxyForUrl } from "proxy-from-env";
import CanceledError from "../cancel/CanceledError.js";
import AxiosError from "../core/AxiosError.js";
import AxiosHeaders from "../core/AxiosHeaders.js";
import buildFullPath from "../core/buildFullPath.js";
import settle from "../core/settle.js";
import type transitionalDefaults from "../defaults/transitional.js";
import { VERSION } from "../env/data.js";
import AxiosTransformStream from "../helpers/AxiosTransformStream.js";
import buildURL from "../helpers/buildURL.js";
import callbackify from "../helpers/callbackify.js";
import estimateDataURLDecodedBytes from "../helpers/estimateDataURLDecodedBytes.js";
import formDataToStream from "../helpers/formDataToStream.js";
import fromDataURI from "../helpers/fromDataURI.js";
import Http2Sessions from "../helpers/Http2Sessions.js";
import {
  progressEventReducer,
  progressEventDecorator,
  asyncDecorator
} from "../helpers/progressEventReducer.js";
import readBlob from "../helpers/readBlob.js";
import { toByteStringHeaderObject } from "../helpers/sanitizeHeaderValue.js";
import shouldBypassProxy from "../helpers/shouldBypassProxy.js";
import ZlibHeaderTransformStream from "../helpers/ZlibHeaderTransformStream.js";
import platform from "../platform/index.js";
import type { InternalAxiosRequestConfig } from "../types.js";
import utils from "../utils.js";

const zlibOptions = {
  flush: zlib.constants.Z_SYNC_FLUSH,
  finishFlush: zlib.constants.Z_SYNC_FLUSH,
};

const brotliOptions = {
  flush: zlib.constants.BROTLI_OPERATION_FLUSH,
  finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH,
};

const zstdOptions = {
  flush: (zlib.constants as Record<string, number>)["ZSTD_e_flush"],
  finishFlush: (zlib.constants as Record<string, number>)["ZSTD_e_flush"],
};

const isBrotliSupported = utils.isFunction(zlib.createBrotliDecompress);
const isZstdSupported = utils.isFunction(
  (zlib as Record<string, unknown>)["createZstdDecompress"]
);
const ACCEPT_ENCODING =
  "gzip, compress, deflate" + (isBrotliSupported ? ", br" : "");
const ACCEPT_ENCODING_WITH_ZSTD =
  ACCEPT_ENCODING + (isZstdSupported ? ", zstd" : "");

const { http: httpFollow, https: httpsFollow } = followRedirects;

const isHttps = /https:?/;
const FORM_DATA_CONTENT_HEADERS = [ "content-type", "content-length" ];

function setFormDataHeaders(
  headers: AxiosHeaders,
  formHeaders: Record<string, unknown>,
  policy: unknown
): void {
  if (policy !== "content-only") {
    headers.set(formHeaders);
    return;
  }

  Object.entries(formHeaders).forEach(([ key, val ]) => {
    if (FORM_DATA_CONTENT_HEADERS.includes(key.toLowerCase())) {
      headers.set(key, val);
    }
  });
}

// Symbols used to bind a single 'error' listener to a pooled socket and track
// the request currently owning that socket across keep-alive reuse (issue #10780).
const kAxiosSocketListener = Symbol("axios.http.socketListener");
const kAxiosCurrentReq = Symbol("axios.http.currentReq");

// Tags HttpsProxyAgent instances installed by setProxy() so the redirect path
// can strip them without clobbering a user-supplied agent that happens to be
// an HttpsProxyAgent.
const kAxiosInstalledTunnel = Symbol("axios.http.installedTunnel");

// Cache of CONNECT-tunneling agents keyed by proxy config so repeat requests
// through the same proxy reuse a single agent (and its socket pool). The
// keyspace is bounded by the set of distinct proxy configs the process uses,
// so unbounded growth is not a concern in practice.
type HttpsProxyAgentInstance = InstanceType<
  typeof createHttpsProxyAgent.HttpsProxyAgent
>;
const tunnelingAgentCache = new Map<string, HttpsProxyAgentInstance>();
const tunnelingAgentCacheUser = new WeakMap<
  object,
  Map<string, HttpsProxyAgentInstance>
>();

function getTunnelingAgent(
  agentOptions: Record<string, unknown>,
  userHttpsAgent:
    | (http.Agent & { options?: Record<string, unknown>; })
    | undefined
): HttpsProxyAgentInstance {
  const key =
    String(agentOptions["protocol"]) +
    "//" +
    String(agentOptions["hostname"]) +
    ":" +
    (agentOptions["port"] || "") +
    "#" +
    (agentOptions["auth"] || "");
  const cache = userHttpsAgent
    ? tunnelingAgentCacheUser.get(userHttpsAgent) ||
      tunnelingAgentCacheUser.set(userHttpsAgent, new Map()).get(userHttpsAgent)
    : tunnelingAgentCache;

  const agent = cache?.get(key);
  if (agent) return agent;
  // Forward the user's TLS options (custom CA, rejectUnauthorized, client cert,
  // etc.) into the tunneling agent so they apply to the origin TLS upgrade
  // performed after CONNECT. Our proxy fields take precedence on conflict.
  const merged =
    userHttpsAgent && userHttpsAgent.options
      ? { ...userHttpsAgent.options, ...agentOptions }
      : agentOptions;
  const newAgent = new createHttpsProxyAgent.HttpsProxyAgent(merged);
  if (userHttpsAgent && userHttpsAgent.options) {
    const originTLSOptions = { ...userHttpsAgent.options };
    const callback = (
      newAgent as unknown as {
        callback: (req: unknown, opts: unknown) => unknown;
      }
    ).callback;
    (
      newAgent as unknown as {
        callback: (req: unknown, opts: unknown) => unknown;
      }
    ).callback = function axiosTunnelingAgentCallback(
      req: unknown,
      opts: unknown
    ) {
      // HttpsProxyAgent v5 reads callback opts for the post-CONNECT origin TLS upgrade.
      return callback.call(this, req, {
        ...originTLSOptions,
        ...(opts as object),
      });
    };
  }
  (newAgent as unknown as Record<symbol, unknown>)[kAxiosInstalledTunnel] =
    true;
  cache?.set(key, newAgent);
  return newAgent;
}

const supportedProtocols = platform.protocols.map(
  (protocol: string) => protocol + ":"
);

// Node's WHATWG URL parser returns `username` and `password` percent-encoded.
// Decode before composing the `auth` option so credentials such as
// `my%40email.com:pass` are sent as `my@email.com:pass`. Falls back to the
// original value for malformed input so a bad encoding never throws.
const decodeURIComponentSafe = (value: unknown): unknown => {
  if (!utils.isString(value)) {
    return value;
  }

  try {
    return decodeURIComponent(value as string);
  }
  catch {
    return value;
  }
};

const flushOnFinish = (
  s: stream.Stream,
  [ throttled, flush ]: [unknown, () => void]
): unknown => {
  s.on("end", flush).on("error", flush);

  return throttled;
};

const http2Sessions = new Http2Sessions();

/**
 * If the proxy, auth, sensitive header, or config beforeRedirects functions are defined,
 * call them with the options object.
 *
 * @param {Object<string, any>} options - The options object that was passed to the request.
 *
 * @returns {Object<string, any>}
 */
function dispatchBeforeRedirect(
  options: Record<string, unknown>,
  responseDetails: unknown,
  requestDetails: unknown
): void {
  const beforeRedirects = options["beforeRedirects"] as
    | Record<string, ((...args: Array<unknown>) => void) | undefined>
    | undefined;
  if (!beforeRedirects) return;
  if (beforeRedirects["proxy"]) {
    beforeRedirects["proxy"](options);
  }
  if (beforeRedirects["auth"]) {
    beforeRedirects["auth"](options);
  }
  if (beforeRedirects["sensitiveHeaders"]) {
    beforeRedirects["sensitiveHeaders"](options, requestDetails);
  }
  if (beforeRedirects["config"]) {
    beforeRedirects["config"](options, responseDetails, requestDetails);
  }
}

function stripMatchingHeaders(
  headers: Record<string, unknown> | undefined,
  sensitiveSet: Set<string>
): void {
  if (!headers) {
    return;
  }

  Object.keys(headers).forEach(header => {
    if (sensitiveSet.has(header.toLowerCase())) {
      delete headers[header];
    }
  });
}

function isSameOriginRedirect(
  redirectOptions: Record<string, unknown>,
  requestDetails: { url?: string; } | undefined
): boolean {
  if (!requestDetails) {
    return false;
  }

  try {
    return (
      new URL(String(requestDetails.url)).origin ===
      new URL(String(redirectOptions["href"])).origin
    );
  }
  catch {
    // If origin comparison fails, treat the redirect as unsafe.
    return false;
  }
}

/**
 * If the proxy or config afterRedirects functions are defined, call them with the options
 *
 * @param {http.ClientRequestArgs} options
 * @param {AxiosProxyConfig} configProxy configuration from Axios options object
 * @param {string} location
 *
 * @returns {http.ClientRequestArgs}
 */

function setProxy(
  options: Record<string, unknown>,
  configProxy: unknown,
  location: string,
  isRedirect: boolean,
  configHttpsAgent: unknown
): void {
  let proxy: unknown = configProxy;
  if (!proxy && proxy !== false) {
    const proxyUrl = getProxyForUrl(location);
    if (proxyUrl) {
      if (!shouldBypassProxy(location)) {
        proxy = new URL(proxyUrl);
      }
    }
  }
  // On redirect re-invocation, strip any stale Proxy-Authorization header carried
  // over from the prior request (e.g. new target no longer uses a proxy, or uses
  // a different proxy). Skip on the initial request so user-supplied headers are
  // preserved. Header names are case-insensitive, so remove every case variant.
  if (isRedirect && options["headers"]) {
    for (const name of Object.keys(options["headers"])) {
      if (name.toLowerCase() === "proxy-authorization") {
        delete (options["headers"] as Record<string, unknown>)[name];
      }
    }
  }
  // Strip any tunneling agent we installed for the previous hop so a redirect
  // that drops the proxy or crosses an HTTPS↔HTTP boundary doesn't reuse a
  // stale one. Match on our Symbol marker so a user-supplied HttpsProxyAgent
  // (which won't carry the marker) is left alone.
  if (
    isRedirect &&
    options["agent"] &&
    (options["agent"] as Record<symbol, unknown>)[kAxiosInstalledTunnel]
  ) {
    options["agent"] = undefined;
  }
  if (proxy) {
    // Read proxy fields without traversing the prototype chain. URL instances expose
    // username/password/hostname/host/port/protocol via getters on URL.prototype (so
    // direct reads are shielded), but plain object proxies — and the `auth` field
    // (which URL does not expose) — must be guarded so a polluted Object.prototype
    // (e.g. Object.prototype.auth = { username, password }) cannot inject
    // attacker-controlled credentials into the Proxy-Authorization header or
    // redirect proxying to an attacker-controlled host.
    const isProxyURL = proxy instanceof URL;
    const readProxyField = (key: string): unknown =>
      isProxyURL || utils.hasOwnProp(proxy, key)
        ? (proxy as Record<string, unknown>)[key]
        : undefined;

    const proxyUsername = readProxyField("username");
    const proxyPassword = readProxyField("password");
    let proxyAuth: unknown = utils.hasOwnProp(proxy, "auth")
      ? (proxy as Record<string, unknown>)["auth"]
      : undefined;

    // Basic proxy authorization
    if (proxyUsername) {
      proxyAuth = proxyUsername + ":" + (proxyPassword || "");
    }

    if (proxyAuth) {
      // Support proxy auth object form. Read sub-fields via own-prop checks so a
      // plain object inheriting from polluted Object.prototype cannot leak creds.
      const authIsObject = typeof proxyAuth === "object";
      const authUsername =
        authIsObject && utils.hasOwnProp(proxyAuth, "username")
          ? (proxyAuth as Record<string, unknown>)["username"]
          : undefined;
      const authPassword =
        authIsObject && utils.hasOwnProp(proxyAuth, "password")
          ? (proxyAuth as Record<string, unknown>)["password"]
          : undefined;
      const validProxyAuth = Boolean(authUsername || authPassword);

      if (validProxyAuth) {
        proxyAuth = (authUsername || "") + ":" + (authPassword || "");
      }
      else if (authIsObject) {
        throw new AxiosError(
          "Invalid proxy authorization",
          AxiosError.ERR_BAD_OPTION,
          { proxy } as unknown as InternalAxiosRequestConfig
        );
      }
    }

    const targetIsHttps = isHttps.test(String(options["protocol"]));

    if (targetIsHttps) {
      // CONNECT-tunneling path for HTTPS targets. Preserves end-to-end TLS to
      // the origin so the proxy cannot inspect the URL, headers, or body — the
      // behavior already promised by THREATMODEL.md (T-R9). HttpsProxyAgent
      // sends Proxy-Authorization on the CONNECT request only, never on the
      // wrapped TLS request, which is why we don't stamp it onto
      // options.headers here. If the user already supplied an HttpsProxyAgent,
      // they own tunneling end-to-end and we leave them alone; otherwise we
      // install our own tunneling agent and forward their TLS options (if any)
      // so a custom httpsAgent for cert pinning / rejectUnauthorized still
      // applies to the origin TLS upgrade.
      if (
        !(configHttpsAgent instanceof createHttpsProxyAgent.HttpsProxyAgent)
      ) {
        const proxyHost = readProxyField("hostname") || readProxyField("host");
        const proxyPort = readProxyField("port");
        const rawProxyProtocol = readProxyField("protocol");
        /* eslint-disable sonarjs/no-nested-conditional */
        const normalizedProtocol = rawProxyProtocol
          ? String(rawProxyProtocol).includes(":")
            ? String(rawProxyProtocol)
            : `${rawProxyProtocol}:`
          : "http:";
        /* eslint-enable sonarjs/no-nested-conditional */
        // Bracket IPv6 literals for URL parsing; URL.hostname strips the
        // brackets again on read so the agent receives the raw form.
        const proxyHostStr = proxyHost ? String(proxyHost) : "";
        const proxyHostForURL =
          proxyHostStr &&
          proxyHostStr.includes(":") &&
          !proxyHostStr.startsWith("[")
            ? `[${proxyHostStr}]`
            : proxyHostStr;
        const proxyURL = new URL(
          `${normalizedProtocol}//${proxyHostForURL}${proxyPort ? ":" + String(proxyPort) : ""}`
        );
        const agentOptions: Record<string, unknown> = {
          protocol: proxyURL.protocol,
          hostname: proxyURL.hostname.replace(/^\[|\]$/g, ""),
          port: proxyURL.port,
          auth:
            proxyAuth && typeof proxyAuth === "string" ? proxyAuth : undefined,
        };
        if (proxyURL.protocol === "https:") {
          agentOptions["ALPNProtocols"] = [ "http/1.1" ];
        }
        const tunnelingAgent = getTunnelingAgent(
          agentOptions,
          configHttpsAgent as
            | (http.Agent & { options?: Record<string, unknown>; })
            | undefined
        );
        // Set both: `options.agent` is consumed by the native https.request path
        // (maxRedirects === 0); `options.agents.https` is consumed by
        // follow-redirects, which ignores `options.agent` when `options.agents`
        // is present.
        options["agent"] = tunnelingAgent;
        if (options["agents"]) {
          (options["agents"] as Record<string, unknown>)["https"] =
            tunnelingAgent;
        }
      }
    }
    else {
      // Forward-proxy mode for plaintext HTTP targets. The request line carries
      // the absolute URL and the proxy sees everything — acceptable for plain
      // HTTP since the wire was already plaintext.
      if (proxyAuth) {
        const base64 = Buffer.from(String(proxyAuth), "utf8").toString(
          "base64"
        );
        (options["headers"] as Record<string, unknown>)["Proxy-Authorization"] =
          "Basic " + base64;
      }

      // Preserve a user-supplied Host header (case-insensitive) so callers can override
      // the value forwarded to the proxy; otherwise default to the request URL's host.
      let hasUserHostHeader = false;
      for (const name of Object.keys(
        options["headers"] as Record<string, unknown>
      )) {
        if (name.toLowerCase() === "host") {
          hasUserHostHeader = true;
          break;
        }
      }
      if (!hasUserHostHeader) {
        (options["headers"] as Record<string, unknown>)["host"] =
          String(options["hostname"]) +
          (options["port"] ? ":" + String(options["port"]) : "");
      }
      const proxyHost = readProxyField("hostname") || readProxyField("host");
      options["hostname"] = proxyHost;
      // Replace 'host' since options is not a URL object
      options["host"] = proxyHost;
      options["port"] = readProxyField("port");
      options["path"] = location;
      const proxyProtocol = readProxyField("protocol");
      if (proxyProtocol) {
        options["protocol"] = String(proxyProtocol).includes(":")
          ? String(proxyProtocol)
          : `${proxyProtocol}:`;
      }
    }
  }

  (options["beforeRedirects"] as Record<string, unknown>)["proxy"] =
    function beforeRedirect(redirectOptions: unknown) {
      // Configure proxy for redirected request, passing the original config proxy to apply
      // the exact same logic as if the redirected request was performed by axios directly.
      setProxy(
        redirectOptions as Record<string, unknown>,
        configProxy,
        String((redirectOptions as Record<string, unknown>)["href"]),
        true,
        configHttpsAgent
      );
    };
}

const isHttpAdapterSupported =
  typeof process !== "undefined" && utils.kindOf(process) === "process";

// temporary hotfix

type OnDoneHandler = (value: unknown, isRejected?: boolean) => void;
type AsyncExecutor = (
  resolve: (value: unknown) => void,
  reject: (reason?: unknown) => void,
  onDone: (handler: OnDoneHandler) => void
) => Promise<void>;

const wrapAsync = async (asyncExecutor: AsyncExecutor): Promise<unknown> =>
  new Promise((resolve, reject) => {
    let onDoneCallback: OnDoneHandler | undefined;
    let isDone = false;

    const done = (value: unknown, isRejected?: boolean) => {
      if (isDone) return;
      isDone = true;
      onDoneCallback && onDoneCallback(value, isRejected);
    };

    const _resolve = (value: unknown) => {
      done(value);
      resolve(value);
    };

    const _reject = (reason?: unknown) => {
      done(reason, true);
      reject(reason);
    };

    asyncExecutor(
      _resolve,
      _reject,
      onDoneHandler => (onDoneCallback = onDoneHandler)
    ).catch(_reject);
  });

const resolveFamily = ({
  address,
  family,
}: {
  address: unknown;
  family?: unknown;
}): { address: string; family: number; } => {
  if (!utils.isString(address)) {
    throw TypeError("address must be a string");
  }
  return {
    address: address as string,
    family:
      (family as number) || ((address as string).indexOf(".") < 0 ? 6 : 4),
  };
};

const buildAddressEntry = (
  address: unknown,
  family?: unknown
): { address: string; family: number; } =>
  resolveFamily(
    utils.isObject(address)
      ? (address as { address: unknown; family?: unknown; })
      : { address, family }
  );

const http2Transport = {
  request(options: unknown, cb: (response: unknown) => void): unknown {
    const opts = options as Record<string, unknown>;
    const authority =
      String(opts["protocol"]) +
      "//" +
      String(opts["hostname"]) +
      ":" +
      (opts["port"] || (opts["protocol"] === "https:" ? 443 : 80));

    const http2Options = opts["http2Options"];
    const headers = opts["headers"];

    const session = http2Sessions.getSession(
      authority,
      http2Options as Record<string, unknown>
    );

    const {
      HTTP2_HEADER_SCHEME,
      HTTP2_HEADER_METHOD,
      HTTP2_HEADER_PATH,
      HTTP2_HEADER_STATUS,
    } = http2.constants;

    const http2Headers: Record<string, unknown> = {
      [HTTP2_HEADER_SCHEME]: String(opts["protocol"]).replace(":", ""),
      [HTTP2_HEADER_METHOD]: opts["method"],
      [HTTP2_HEADER_PATH]: opts["path"],
    };

    utils.forEach(headers, (header: unknown, name: unknown) => {
      const nameStr = String(name);
      nameStr.charAt(0) !== ":" && (http2Headers[nameStr] = header);
    });

    const req = session.request(http2Headers as http2.OutgoingHttpHeaders);

    req.once("response", (responseHeaders: http2.IncomingHttpHeaders) => {
      const response = req; //duplex

      const mergedHeaders = Object.assign({}, responseHeaders);

      const status = mergedHeaders[HTTP2_HEADER_STATUS];

      delete mergedHeaders[HTTP2_HEADER_STATUS];

      (response as unknown as Record<string, unknown>)["headers"] =
        mergedHeaders;

      (response as unknown as Record<string, unknown>)["statusCode"] =
        +(status as string | number);

      cb(response);
    });

    return req;
  },
};

/*eslint consistent-return:0*/
export default isHttpAdapterSupported &&
  async function httpAdapter(config: InternalAxiosRequestConfig) {
    return wrapAsync(
      async function dispatchHttpRequest(resolve, reject, onDone) {
        // Read config pollution-safely: own properties and members inherited from
        // a non-Object.prototype source (e.g. an Object.create(defaults) template)
        // are honored, but values injected onto a polluted Object.prototype are
        // ignored. All behavior-affecting reads in this adapter go through own()
        // so the protection boundary stays consistent.
        const own = (key: string): unknown => utils.getSafeProp(config, key);
        const transitional = own("transitional") as typeof transitionalDefaults;
        let data: unknown = own("data");
        let lookup: unknown = own("lookup");
        let family: unknown = own("family");
        let httpVersion: unknown = own("httpVersion");
        if (httpVersion === undefined) httpVersion = 1;
        const http2Options: unknown = own("http2Options");
        const responseType: unknown = own("responseType");
        const responseEncoding: unknown = own("responseEncoding");
        const httpAgent: unknown = own("httpAgent");
        const httpsAgent: unknown = own("httpsAgent");
        const method = String(own("method")).toUpperCase();
        const maxRedirects: unknown = own("maxRedirects");
        const maxBodyLength: unknown = own("maxBodyLength");
        const maxContentLength: unknown = own("maxContentLength");
        const decompress: unknown = own("decompress");
        let isDone: boolean | undefined;
        let rejected = false;
        let req: unknown;
        let connectPhaseTimer: ReturnType<typeof setTimeout> | undefined;

        httpVersion = Number(httpVersion);

        if (Number.isNaN(httpVersion)) {
          throw TypeError(
            `Invalid protocol version: '${String((config as unknown as Record<string, unknown>)["httpVersion"])}' is not a number`
          );
        }

        if (httpVersion !== 1 && httpVersion !== 2) {
          throw TypeError(`Unsupported protocol version '${httpVersion}'`);
        }

        const isHttp2 = httpVersion === 2;

        if (lookup) {
          const _lookup = callbackify(
            lookup as (...args: Array<unknown>) => unknown,
            (value: unknown) =>
              utils.isArray(value) ? (value as Array<unknown>) : [ value ]
          ) as (
            hostname: string,
            opt: unknown,
            cb: (err: Error | null, ...args: Array<unknown>) => void
          ) => void;
          // hotfix to support opt.all option which is required for node 20.x

          lookup = (
            hostname: string,
            opt: Record<string, unknown>,
            cb: (err: Error | null, ...args: Array<unknown>) => void
          ) => {
            _lookup(
              hostname,
              opt,
              (err: Error | null, arg0: unknown, arg1: unknown) => {
                if (err) {
                  return cb(err);
                }

                /* eslint-disable sonarjs/no-nested-functions */
                const addresses = utils.isArray(arg0)
                  ? (arg0 as Array<unknown>).map((addr: unknown) =>
                    buildAddressEntry(addr)
                  )
                  : [ buildAddressEntry(arg0, arg1) ];
                /* eslint-enable sonarjs/no-nested-functions */

                opt["all"]
                  ? cb(null, addresses)
                  : cb(null, addresses[0]!.address, addresses[0]!.family);
              }
            );
          };
        }

        const abortEmitter = new EventEmitter();

        function abort(reason?: unknown): void {
          try {
            abortEmitter.emit(
              "abort",
              !reason || (reason as Record<string, unknown>)["type"]
                ? new CanceledError(null, config, req)
                : reason
            );
          }
          catch {
            // ignore emit errors
          }
        }

        function clearConnectPhaseTimer(): void {
          if (connectPhaseTimer) {
            clearTimeout(connectPhaseTimer);
            connectPhaseTimer = undefined;
          }
        }

        function createTimeoutError(): AxiosError {
          const configTimeout = own("timeout");
          let timeoutErrorMessage = configTimeout
            ? "timeout of " + String(configTimeout) + "ms exceeded"
            : "timeout exceeded";
          const configTimeoutErrorMessage = own("timeoutErrorMessage");
          if (configTimeoutErrorMessage) {
            timeoutErrorMessage = String(configTimeoutErrorMessage);
          }
          return new AxiosError(
            timeoutErrorMessage,
            transitional.clarifyTimeoutError
              ? AxiosError.ETIMEDOUT
              : AxiosError.ECONNABORTED,
            config,
            req
          );
        }

        abortEmitter.once("abort", reject);

        const onFinished = (): void => {
          clearConnectPhaseTimer();

          if (config.cancelToken) {
            config.cancelToken.unsubscribe(abort);
          }

          if (config.signal) {
            config.signal.removeEventListener &&
              config.signal.removeEventListener("abort", abort);
          }

          abortEmitter.removeAllListeners();
        };

        if (config.cancelToken || config.signal) {
          config.cancelToken && config.cancelToken.subscribe(abort);
          if (config.signal) {
            config.signal.aborted
              ? abort()
              : config.signal.addEventListener &&
                config.signal.addEventListener("abort", abort);
          }
        }

        onDone((response: unknown, isRejected?: boolean) => {
          isDone = true;
          clearConnectPhaseTimer();

          if (isRejected) {
            rejected = true;
            onFinished();
            return;
          }

          const responseData = (response as Record<string, unknown>)["data"];

          if (
            responseData instanceof stream.Readable ||
            responseData instanceof stream.Duplex
          ) {
            const offListeners = stream.finished(responseData, () => {
              offListeners();
              onFinished();
            });
          }
          else {
            onFinished();
          }
        });

        // Parse url
        const fullPath = buildFullPath(
          own("baseURL"),
          own("url"),
          own("allowAbsoluteUrls"),
          config
        );
        const parsed = new URL(
          fullPath,
          platform.hasBrowserEnv ? platform.origin : undefined
        );
        const protocol = parsed.protocol || supportedProtocols[0]!;

        if (protocol === "data:") {
          // Apply the same semantics as HTTP: only enforce if a finite, non-negative cap is set.
          if ((maxContentLength as number) > -1) {
            // Use the exact string passed to fromDataURI (the configured url); fall back to fullPath if needed.
            const dataUrl = String(own("url") || fullPath || "");
            const estimated = estimateDataURLDecodedBytes(dataUrl);

            if (estimated > (maxContentLength as number)) {
              return reject(
                new AxiosError(
                  "maxContentLength size of " +
                    String(maxContentLength) +
                    " exceeded",
                  AxiosError.ERR_BAD_RESPONSE,
                  config
                )
              );
            }
          }

          let convertedData: unknown;

          if (method !== "GET") {
            return settle(resolve, reject, {
              status: 405,
              statusText: "method not allowed",
              headers: {},
              config,
              data: undefined,
              request: undefined,
            });
          }

          try {
            convertedData = fromDataURI(
              own("url") as string,
              responseType === "blob",
              {
                Blob:
                  config.env &&
                  ((config.env as Record<string, unknown>)["Blob"] as
                    | (new (...args: Array<unknown>) => object)
                    | undefined),
              }
            );
          }
          catch (err) {
            throw AxiosError.from(
              err as Error,
              AxiosError.ERR_BAD_REQUEST,
              config
            );
          }

          if (responseType === "text") {
            convertedData = (convertedData as Buffer).toString(
              responseEncoding as BufferEncoding
            );

            if (!responseEncoding || responseEncoding === "utf8") {
              convertedData = utils.stripBOM(convertedData as string);
            }
          }
          else if (responseType === "stream") {
            convertedData = stream.Readable.from(
              convertedData as Iterable<unknown>
            );
          }

          return settle(resolve, reject, {
            data: convertedData,
            status: 200,
            statusText: "OK",
            headers: new AxiosHeaders(),
            config,
            request: undefined,
          });
        }

        if (supportedProtocols.indexOf(protocol) === -1) {
          return reject(
            new AxiosError(
              "Unsupported protocol " + protocol,
              AxiosError.ERR_BAD_REQUEST,
              config
            )
          );
        }

        const headers = AxiosHeaders.from(config.headers).normalize(
          false
        ) as AxiosHeaders & {
          setContentType: (value: unknown, rewrite?: unknown) => void;
          setContentLength: (value: unknown, rewrite?: unknown) => void;
          getContentLength: (matcher?: unknown) => unknown;
          getContentType: (matcher?: unknown) => unknown;
          hasContentLength: (matcher?: unknown) => boolean;
        };

        // Set User-Agent (required by some servers)
        // See https://github.com/axios/axios/issues/69
        // User-Agent is specified; handle case where no UA header is desired
        // Only set header if it hasn't been set in config
        headers.set("User-Agent", "axios/" + VERSION, false);

        const { onUploadProgress, onDownloadProgress } = config;
        const maxRate = config.maxRate;
        let maxUploadRate: number | undefined = undefined;
        let maxDownloadRate: number | undefined = undefined;

        // support for spec compliant FormData objects
        if (utils.isSpecCompliantForm(data)) {
          const userBoundary = headers.getContentType(
            /boundary=([-\w]{10,70})/i
          );

          data = formDataToStream(
            data,
            (formHeaders: Record<string, unknown>) => {
              headers.set(formHeaders);
            },
            {
              tag: `axios-${VERSION}-boundary`,
              boundary: (userBoundary &&
                (userBoundary as RegExpMatchArray)[1]) as string | undefined,
            }
          );
          // support for https://www.npmjs.com/package/form-data api
        }
        else if (
          utils.isFormData(data) &&
          utils.isFunction((data as Record<string, unknown>)["getHeaders"])
        ) {
          const dataWithHeaders = data as {
            getHeaders: () => Record<string, unknown>;
            getLength: (cb: (err: Error | null, len: number) => void) => void;
          };
          setFormDataHeaders(
            headers,
            dataWithHeaders.getHeaders(),
            own("formDataHeaderPolicy")
          );

          if (!headers.hasContentLength()) {
            try {
              const knownLength = await util
                .promisify(dataWithHeaders.getLength)
                .call(data);
              Number.isFinite(knownLength) &&
                knownLength >= 0 &&
                headers.setContentLength(knownLength);
              /*eslint no-empty:0*/
            }
            catch {}
          }
        }
        else if (utils.isBlob(data) || utils.isFile(data)) {
          const blobData = data as { size: number; type: string; };
          blobData.size &&
            headers.setContentType(blobData.type || "application/octet-stream");
          headers.setContentLength(blobData.size || 0);
          data = stream.Readable.from(
            readBlob(data as Parameters<typeof readBlob>[0])
          );
        }
        else if (data && !utils.isStream(data)) {
          if (Buffer.isBuffer(data)) {
            // Nothing to do...
          }
          else if (utils.isArrayBuffer(data)) {
            data = Buffer.from(new Uint8Array(data as ArrayBuffer));
          }
          else if (utils.isString(data)) {
            data = Buffer.from(data as string, "utf-8");
          }
          else {
            return reject(
              new AxiosError(
                "Data after transformation must be a string, an ArrayBuffer, a Buffer, or a Stream",
                AxiosError.ERR_BAD_REQUEST,
                config
              )
            );
          }

          // Add Content-Length header if data exists
          headers.setContentLength((data as Buffer).length, false);

          if (
            (maxBodyLength as number) > -1 &&
            (data as Buffer).length > (maxBodyLength as number)
          ) {
            return reject(
              new AxiosError(
                "Request body larger than maxBodyLength limit",
                AxiosError.ERR_BAD_REQUEST,
                config
              )
            );
          }
        }

        const contentLength = utils.toFiniteNumber(headers.getContentLength());

        if (utils.isArray(maxRate)) {
          maxUploadRate = maxRate[0];
          maxDownloadRate = maxRate[1];
        }
        else {
          maxUploadRate = maxDownloadRate = maxRate as number;
        }

        if (data && (onUploadProgress || maxUploadRate)) {
          if (!utils.isStream(data)) {
            data = stream.Readable.from(data as Iterable<unknown>, {
              objectMode: false,
            });
          }

          data = (
            stream.pipeline as unknown as (
              streams: Array<unknown>,
              cb: unknown
            ) => stream.Readable
          )(
            [
              data,
              new AxiosTransformStream({
                maxRate: utils.toFiniteNumber(maxUploadRate),
              }),
            ],
            utils.noop
          );

          onUploadProgress &&
            (data as stream.Stream).on(
              "progress",
              flushOnFinish(
                data as stream.Stream,
                progressEventDecorator(
                  contentLength,
                  progressEventReducer(
                    asyncDecorator(
                      onUploadProgress as (...args: Array<unknown>) => unknown
                    ),
                    false,
                    3
                  )
                )
              ) as (...args: Array<unknown>) => void
            );
        }

        // HTTP basic authentication
        let auth: string | undefined = undefined;
        const configAuth = own("auth");
        if (configAuth) {
          const username = String(
            utils.getSafeProp(configAuth, "username") || ""
          );
          const password = String(
            utils.getSafeProp(configAuth, "password") || ""
          );
          auth = username + ":" + password;
        }

        if (!auth && (parsed.username || parsed.password)) {
          const urlUsername = decodeURIComponentSafe(parsed.username);
          const urlPassword = decodeURIComponentSafe(parsed.password);
          auth = String(urlUsername) + ":" + String(urlPassword);
        }

        auth && headers.delete("authorization");

        let path: string;

        try {
          path = buildURL(
            parsed.pathname + parsed.search,
            own("params"),
            own("paramsSerializer")
          ).replace(/^\?/, "");
        }
        catch (err) {
          const customErr = new Error((err as Error).message) as Error & {
            config?: unknown;
            url?: unknown;
            exists?: boolean;
          };
          customErr.config = config;
          customErr.url = own("url");
          customErr.exists = true;
          return reject(customErr);
        }

        headers.set(
          "Accept-Encoding",
          utils.hasOwnProp(transitional, "advertiseZstdAcceptEncoding") &&
            transitional.advertiseZstdAcceptEncoding === true
            ? ACCEPT_ENCODING_WITH_ZSTD
            : ACCEPT_ENCODING,
          false
        );

        // Null-prototype to block prototype pollution gadgets on properties read
        // directly by Node's http.request (e.g. insecureHTTPParser, lookup).
        const options: Record<string, unknown> = Object.assign(
          Object.create(null) as object,
          {
            path,
            method: method,
            headers: toByteStringHeaderObject(headers),
            agents: { http: httpAgent, https: httpsAgent },
            auth,
            protocol,
            family,
            beforeRedirect: dispatchBeforeRedirect,
            beforeRedirects: Object.create(null) as Record<string, unknown>,
            http2Options,
          }
        );

        // cacheable-lookup integration hotfix
        !utils.isUndefined(lookup) && (options["lookup"] = lookup);

        const socketPath = own("socketPath");
        if (socketPath) {
          if (typeof socketPath !== "string") {
            return reject(
              new AxiosError(
                "socketPath must be a string",
                AxiosError.ERR_BAD_OPTION_VALUE,
                config
              )
            );
          }

          const allowedSocketPaths = own("allowedSocketPaths");
          if (allowedSocketPaths != null) {
            const allowed = Array.isArray(allowedSocketPaths)
              ? (allowedSocketPaths as Array<string>)
              : [ allowedSocketPaths as string ];

            const resolvedSocket = resolvePath(socketPath);
            const isAllowed = allowed.some(
              (entry: unknown) =>
                typeof entry === "string" &&
                resolvePath(entry) === resolvedSocket
            );

            if (!isAllowed) {
              return reject(
                new AxiosError(
                  `socketPath "${socketPath}" is not permitted by allowedSocketPaths`,
                  AxiosError.ERR_BAD_OPTION_VALUE,
                  config
                )
              );
            }
          }

          options["socketPath"] = socketPath;
        }
        else {
          options["hostname"] = parsed.hostname.startsWith("[")
            ? parsed.hostname.slice(1, -1)
            : parsed.hostname;
          options["port"] = parsed.port;
          setProxy(
            options,
            own("proxy"),
            protocol +
              "//" +
              parsed.hostname +
              (parsed.port ? ":" + parsed.port : "") +
              String(options["path"]),
            false,
            httpsAgent
          );
        }
        let transport: {
          request: (options: unknown, cb: (res: unknown) => void) => unknown;
        } = http2Transport;
        let isNativeTransport = false;
        // True only for the follow-redirects transport, which applies
        // options.maxBodyLength itself. Every other transport (http2, native
        // http/https, a user-supplied custom transport) needs the explicit
        // byte-counting pipeline below to enforce maxBodyLength on streamed uploads.
        let transportEnforcesMaxBodyLength = false;
        const isHttpsRequest = isHttps.test(String(options["protocol"]));
        // Don't clobber a CONNECT-tunneling agent installed by setProxy() for an
        // HTTPS target.
        if (options["agent"] == null) {
          options["agent"] = isHttpsRequest ? httpsAgent : httpAgent;
        }

        if (isHttp2) {
          transport = http2Transport;
        }
        else {
          const configTransport = own("transport");
          if (configTransport) {
            transport = configTransport as typeof transport;
          }
          else if (maxRedirects === 0) {
            transport = (isHttpsRequest ? https : http) as typeof transport;
            isNativeTransport = true;
          }
          else {
            transportEnforcesMaxBodyLength = true;
            options["sensitiveHeaders"] = [];
            if (maxRedirects) {
              options["maxRedirects"] = maxRedirects;
            }
            const configBeforeRedirect = own("beforeRedirect");
            if (configBeforeRedirect) {
              (options["beforeRedirects"] as Record<string, unknown>)[
                "config"
              ] = configBeforeRedirect;
            }
            if (auth) {
              // Restore HTTP Basic credentials on same-origin redirects only.
              // follow-redirects >= 1.15.8 strips Authorization on every redirect (see #6929);
              // cross-origin stripping is the documented mitigation for T-R2 in THREATMODEL.md
              // and is preserved by deliberately not restoring on origin change.
              const requestOrigin = parsed.origin;
              const authToRestore = auth;
              (options["beforeRedirects"] as Record<string, unknown>)["auth"] =
                function beforeRedirectAuth(redirectOptions: unknown) {
                  try {
                    if (
                      new URL(
                        String(
                          (redirectOptions as Record<string, unknown>)["href"]
                        )
                      ).origin === requestOrigin
                    ) {
                      (redirectOptions as Record<string, unknown>)["auth"] =
                        authToRestore;
                    }
                  }
                  catch {
                    // ignore malformed URL: leaving auth stripped is fail-safe
                  }
                };
            }
            const sensitiveHeaders = own("sensitiveHeaders");
            if (sensitiveHeaders != null) {
              if (!utils.isArray(sensitiveHeaders)) {
                return reject(
                  new AxiosError(
                    "sensitiveHeaders must be an array of strings",
                    AxiosError.ERR_BAD_OPTION_VALUE,
                    config
                  )
                );
              }

              const sensitiveSet = new Set<string>();
              for (const header of sensitiveHeaders as Array<unknown>) {
                if (!utils.isString(header)) {
                  return reject(
                    new AxiosError(
                      "sensitiveHeaders must be an array of strings",
                      AxiosError.ERR_BAD_OPTION_VALUE,
                      config
                    )
                  );
                }

                sensitiveSet.add((header as string).toLowerCase());
              }

              if (sensitiveSet.size) {
                options["sensitiveHeaders"] = Array.from(sensitiveSet);
                (options["beforeRedirects"] as Record<string, unknown>)[
                  "sensitiveHeaders"
                ] = function beforeRedirectSensitiveHeaders(
                  redirectOptions: unknown,
                  requestDetails: unknown
                ) {
                  if (
                    !isSameOriginRedirect(
                      redirectOptions as Record<string, unknown>,
                      requestDetails as { url?: string; } | undefined
                    )
                  ) {
                    stripMatchingHeaders(
                      (redirectOptions as Record<string, unknown>)[
                        "headers"
                      ] as Record<string, unknown> | undefined,
                      sensitiveSet
                    );
                  }
                };
              }
            }
            transport = (
              isHttpsRequest ? httpsFollow : httpFollow
            ) as typeof transport;
          }
        }

        if ((maxBodyLength as number) > -1) {
          options["maxBodyLength"] = maxBodyLength;
        }
        else {
          // follow-redirects does not skip comparison, so it should always succeed for axios -1 unlimited
          options["maxBodyLength"] = Infinity;
        }

        // Always set an explicit own value so a polluted
        // Object.prototype.insecureHTTPParser cannot enable the lenient parser
        // through Node's internal options copy
        options["insecureHTTPParser"] = Boolean(own("insecureHTTPParser"));

        // Create the request

        req = transport.request(options, function handleResponse(res: unknown) {
          clearConnectPhaseTimer();

          const resObj = res as http.IncomingMessage & {
            req?: http.ClientRequest;
          };

          if ((req as http.ClientRequest).destroyed) return;

          const streams: Array<stream.Stream | stream.Readable> = [ resObj ];

          const responseLength = utils.toFiniteNumber(
            resObj.headers["content-length"]
          );

          if (onDownloadProgress || maxDownloadRate) {
            const transformStream = new AxiosTransformStream({
              maxRate: utils.toFiniteNumber(maxDownloadRate),
            });

            onDownloadProgress &&
              transformStream.on(
                "progress",
                flushOnFinish(
                  transformStream,
                  progressEventDecorator(
                    responseLength,
                    progressEventReducer(
                      asyncDecorator(
                        onDownloadProgress as (
                          ...args: Array<unknown>
                        ) => unknown
                      ),
                      true,
                      3
                    )
                  )
                ) as (...args: Array<unknown>) => void
              );

            streams.push(transformStream);
          }

          // decompress the response body transparently if required
          let responseStream: stream.Stream | stream.Readable = resObj;

          // return the last request in case of redirects
          const lastRequest = resObj.req || req;

          // if decompress disabled we should not decompress
          if (decompress !== false && resObj.headers["content-encoding"]) {
            // if no content, but headers still say that it is encoded,
            // remove the header not confuse downstream operations
            if (method === "HEAD" || resObj.statusCode === 204) {
              delete resObj.headers["content-encoding"];
            }

            switch ((resObj.headers["content-encoding"] || "").toLowerCase()) {
              /*eslint default-case:0*/
              case "gzip":
              case "x-gzip":
              case "compress":
              case "x-compress":
                // add the unzipper to the body stream processing pipeline
                streams.push(zlib.createUnzip(zlibOptions));

                // remove the content-encoding in order to not confuse downstream operations
                delete resObj.headers["content-encoding"];
                break;
              case "deflate":
                streams.push(new ZlibHeaderTransformStream());

                // add the unzipper to the body stream processing pipeline
                streams.push(zlib.createUnzip(zlibOptions));

                // remove the content-encoding in order to not confuse downstream operations
                delete resObj.headers["content-encoding"];
                break;
              case "br":
                if (isBrotliSupported) {
                  streams.push(zlib.createBrotliDecompress(brotliOptions));
                  delete resObj.headers["content-encoding"];
                }
                break;
              case "zstd":
                if (isZstdSupported) {
                  streams.push(
                    (
                      zlib as unknown as Record<
                        string,
                        (opts: unknown) => stream.Transform
                      >
                    )["createZstdDecompress"]!(zstdOptions)
                  );
                  delete resObj.headers["content-encoding"];
                }
                break;
            }
          }

          responseStream =
            streams.length > 1
              ? (
                stream.pipeline as unknown as (
                  streams: Array<unknown>,
                  cb: unknown
                ) => stream.Readable
              )(streams, utils.noop)
              : streams[0]!;

          const response = {
            status: resObj.statusCode ?? 0,
            statusText: resObj.statusMessage ?? "",
            headers: new AxiosHeaders(resObj.headers),
            config,
            request: lastRequest,
            data: undefined as unknown,
          };

          if (responseType === "stream") {
            // Enforce maxContentLength on streamed responses; previously this
            // was applied only to buffered responses.
            if ((maxContentLength as number) > -1) {
              const limit = maxContentLength as number;
              const source = responseStream;
              async function* enforceMaxContentLength() {
                let totalResponseBytes = 0;
                for await (const chunk of source as unknown as AsyncIterable<Buffer>) {
                  totalResponseBytes += chunk.length;
                  if (totalResponseBytes > limit) {
                    throw new AxiosError(
                      "maxContentLength size of " + limit + " exceeded",
                      AxiosError.ERR_BAD_RESPONSE,
                      config,
                      lastRequest
                    );
                  }
                  yield chunk;
                }
              }
              responseStream = stream.Readable.from(enforceMaxContentLength(), {
                objectMode: false,
              });
            }
            response.data = responseStream;
            settle(resolve, reject, response);
          }
          else {
            const responseBuffer: Array<Buffer> = [];
            let totalResponseBytes = 0;

            responseStream.on("data", function handleStreamData(chunk: Buffer) {
              responseBuffer.push(chunk);
              totalResponseBytes += chunk.length;

              // make sure the content length is not over the maxContentLength if specified
              if (
                (maxContentLength as number) > -1 &&
                totalResponseBytes > (maxContentLength as number)
              ) {
                // stream.destroy() emit aborted event before calling reject() on Node.js v16
                rejected = true;
                (responseStream as stream.Readable).destroy();
                abort(
                  new AxiosError(
                    "maxContentLength size of " +
                      String(maxContentLength) +
                      " exceeded",
                    AxiosError.ERR_BAD_RESPONSE,
                    config,
                    lastRequest
                  )
                );
              }
            });

            responseStream.on("aborted", function handlerStreamAborted() {
              if (rejected) {
                return;
              }

              const err = new AxiosError(
                "stream has been aborted",
                AxiosError.ERR_BAD_RESPONSE,
                config,
                lastRequest,
                response
              );
              (responseStream as stream.Readable).destroy(err);
              reject(err);
            });

            responseStream.on("error", function handleStreamError(err: Error) {
              if (rejected) return;
              reject(
                AxiosError.from(err, undefined, config, lastRequest, response)
              );
            });

            responseStream.on("end", function handleStreamEnd() {
              try {
                let responseData: Buffer | string =
                  responseBuffer.length === 1
                    ? responseBuffer[0]!
                    : Buffer.concat(
                      responseBuffer as unknown as Array<Uint8Array>
                    );
                if (responseType !== "arraybuffer") {
                  responseData = responseData.toString(
                    responseEncoding as BufferEncoding
                  );
                  if (!responseEncoding || responseEncoding === "utf8") {
                    responseData = utils.stripBOM(responseData);
                  }
                }
                response.data = responseData;
              }
              catch (err) {
                return reject(
                  AxiosError.from(
                    err as Error,
                    undefined,
                    config,
                    response.request,
                    response
                  )
                );
              }
              settle(resolve, reject, response);
            });
          }

          abortEmitter.once("abort", (err: unknown) => {
            const readableStream = responseStream as stream.Readable;
            if (!readableStream.destroyed) {
              readableStream.emit("error", err);
              readableStream.destroy();
            }
          });
        });

        abortEmitter.once("abort", (err: unknown) => {
          const reqObj = req as {
            close?: () => void;
            destroy: (err?: unknown) => void;
          };
          if (reqObj.close) {
            reqObj.close();
          }
          else {
            reqObj.destroy(err);
          }
        });

        // Handle errors
        (req as http.ClientRequest).on(
          "error",
          function handleRequestError(err: Error) {
            reject(AxiosError.from(err, undefined, config, req));
          }
        );

        // set tcp keep alive to prevent drop connection by peer
        // Track every socket bound to this outer RedirectableRequest so a single
        // 'close' listener can release ownership on all of them. follow-redirects
        // re-emits the 'socket' event for each hop's native request onto the same
        // outer request, so attaching per-request listeners inside this handler
        // would accumulate across hops and trigger MaxListenersExceededWarning at
        // >= 11 redirects. Clearing only the last-bound socket would leave stale
        // kAxiosCurrentReq refs on earlier hop sockets returned to the keep-alive
        // pool, causing an idle-pool 'error' to be attributed to a closed req.
        const boundSockets = new Set<net.Socket & Record<symbol, unknown>>();

        (req as http.ClientRequest).on(
          "socket",
          function handleRequestSocket(socket: net.Socket) {
            // default interval of sending ack packet is 1 minute
            socket.setKeepAlive(true, 1000 * 60);

            // Install a single 'error' listener per socket (not per request) to avoid
            // accumulating listeners on pooled keep-alive sockets that get reassigned
            // to new requests before the previous request's 'close' fires (issue #10780).
            // The listener is bound to the socket's currently-active request via a
            // symbol, which is swapped as the socket is reassigned.
            const s = socket as net.Socket & Record<symbol, unknown>;
            if (!s[kAxiosSocketListener]) {
              socket.on("error", function handleSocketError(err: Error) {
                const current = s[kAxiosCurrentReq] as
                  | (http.ClientRequest & { destroyed: boolean; })
                  | null;
                if (current && !current.destroyed) {
                  current.destroy(err);
                }
              });
              s[kAxiosSocketListener] = true;
            }

            s[kAxiosCurrentReq] = req;
            boundSockets.add(s);
          }
        );

        (req as http.ClientRequest).once("close", function clearCurrentReq() {
          clearConnectPhaseTimer();

          for (const socket of boundSockets) {
            if (socket[kAxiosCurrentReq] === req) {
              socket[kAxiosCurrentReq] = null;
            }
          }
          boundSockets.clear();
        });

        // Handle request timeout
        if (own("timeout")) {
          // This is forcing a int timeout to avoid problems if the `req` interface doesn't handle other types.
          const timeout = parseInt(String(own("timeout")), 10);

          if (Number.isNaN(timeout)) {
            abort(
              new AxiosError(
                "error trying to parse `config.timeout` to int",
                AxiosError.ERR_BAD_OPTION_VALUE,
                config,
                req
              )
            );

            return;
          }

          const handleTimeout = function handleTimeout(): void {
            if (isDone) return;
            abort(createTimeoutError());
          };

          if (isNativeTransport && timeout > 0) {
            // Native ClientRequest#setTimeout starts from the socket lifecycle and
            // may not fire while TCP connect is still pending. Mirror the
            // follow-redirects wall-clock timer for the maxRedirects === 0 path.
            connectPhaseTimer = setTimeout(handleTimeout, timeout);
          }

          // Sometime, the response will be very slow, and does not respond, the connect event will be block by event loop system.
          // And timer callback will be fired, and abort() will be invoked before connection, then get "socket hang up" and code ECONNRESET.
          // At this time, if we have a large number of request, nodejs will hang up some socket on background. and the number will up and up.
          // And then these socket which be hang up will devouring CPU little by little.
          // ClientRequest.setTimeout will be fired on the specify milliseconds, and can make sure that abort() will be fired after connect.
          (req as http.ClientRequest).setTimeout(timeout, handleTimeout);
        }
        else {
          // explicitly reset the socket timeout value for a possible `keep-alive` request
          (req as http.ClientRequest).setTimeout(0);
        }

        // Send the request
        if (utils.isStream(data)) {
          let ended = false;
          let errored = false;

          (data as stream.Readable).on("end", () => {
            ended = true;
          });

          (data as stream.Readable).once("error", (err: Error) => {
            errored = true;
            (req as http.ClientRequest).destroy(err);
          });

          (data as stream.Readable).on("close", () => {
            if (!ended && !errored) {
              abort(
                new CanceledError(
                  "Request stream has been aborted",
                  config,
                  req
                )
              );
            }
          });

          // Enforce maxBodyLength for streamed uploads on every transport that
          // does not apply options.maxBodyLength itself (native http/https, http2,
          // and user-supplied custom transports). The follow-redirects transport
          // enforces it on the redirected HTTP/1 path.
          let uploadStream: stream.Stream = data as stream.Readable;
          if (
            (maxBodyLength as number) > -1 &&
            !transportEnforcesMaxBodyLength
          ) {
            const limit = maxBodyLength as number;
            let bytesSent = 0;
            uploadStream = (
              stream.pipeline as unknown as (
                streams: Array<unknown>,
                cb: unknown
              ) => stream.Readable
            )(
              [
                data,
                new stream.Transform({
                  transform(
                    chunk: Buffer,
                    _enc: BufferEncoding,
                    cb: (err?: Error | null, data?: Buffer) => void
                  ) {
                    bytesSent += chunk.length;
                    if (bytesSent > limit) {
                      return cb(
                        new AxiosError(
                          "Request body larger than maxBodyLength limit",
                          AxiosError.ERR_BAD_REQUEST,
                          config,
                          req
                        )
                      );
                    }
                    cb(null, chunk);
                  },
                }),
              ],
              utils.noop
            );
            uploadStream.on("error", (err: Error) => {
              const reqObj = req as http.ClientRequest;
              if (!reqObj.destroyed) reqObj.destroy(err);
            });
          }

          (uploadStream as stream.Readable).pipe(req as http.ClientRequest);
        }
        else {
          data && (req as http.ClientRequest).write(data);
          (req as http.ClientRequest).end();
        }
      }
    );
  };

export const __setProxy = setProxy;
export const __isSameOriginRedirect = isSameOriginRedirect;
