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
import transitionalDefaults from "../defaults/transitional.js";
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

function makeProxyFieldReader(proxy: unknown): (key: string) => unknown {
  const isProxyURL = proxy instanceof URL;
  return (key: string): unknown =>
    isProxyURL || utils.hasOwnProp(proxy, key)
      ? (proxy as Record<string, unknown>)[key]
      : undefined;
}

function resolveProxyAuth(proxy: unknown): unknown {
  const readField = makeProxyFieldReader(proxy);

  const proxyUsername = readField("username");
  const proxyPassword = readField("password");
  let proxyAuth: unknown = utils.hasOwnProp(proxy, "auth")
    ? (proxy as Record<string, unknown>)["auth"]
    : undefined;

  if (proxyUsername) {
    proxyAuth = proxyUsername + ":" + (proxyPassword || "");
  }

  if (proxyAuth && typeof proxyAuth === "object") {
    const authUsername = utils.hasOwnProp(proxyAuth, "username")
      ? (proxyAuth as Record<string, unknown>)["username"]
      : undefined;
    const authPassword = utils.hasOwnProp(proxyAuth, "password")
      ? (proxyAuth as Record<string, unknown>)["password"]
      : undefined;

    if (authUsername || authPassword) {
      proxyAuth = (authUsername || "") + ":" + (authPassword || "");
    }
    else {
      throw new AxiosError(
        "Invalid proxy authorization",
        AxiosError.ERR_BAD_OPTION,
        { proxy } as unknown as InternalAxiosRequestConfig
      );
    }
  }

  return proxyAuth;
}

function setupHttpsProxy(
  options: Record<string, unknown>,
  proxy: unknown,
  proxyAuth: unknown,
  configHttpsAgent: unknown
): void {
  if (configHttpsAgent instanceof createHttpsProxyAgent.HttpsProxyAgent) {
    return;
  }
  const readField = makeProxyFieldReader(proxy);

  const proxyHost = readField("hostname") || readField("host");
  const proxyPort = readField("port");
  const rawProxyProtocol = readField("protocol");
  /* eslint-disable sonarjs/no-nested-conditional */
  const normalizedProtocol = rawProxyProtocol
    ? String(rawProxyProtocol).includes(":")
      ? String(rawProxyProtocol)
      : `${rawProxyProtocol}:`
    : "http:";
  /* eslint-enable sonarjs/no-nested-conditional */
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
  options["agent"] = tunnelingAgent;
  if (options["agents"]) {
    (options["agents"] as Record<string, unknown>)["https"] = tunnelingAgent;
  }
}

function setupHttpProxy(
  options: Record<string, unknown>,
  proxy: unknown,
  proxyAuth: unknown,
  location: string
): void {
  if (proxyAuth) {
    const base64 = Buffer.from(String(proxyAuth), "utf8").toString("base64");
    (options["headers"] as Record<string, unknown>)["Proxy-Authorization"] =
      "Basic " + base64;
  }

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

  const readField = makeProxyFieldReader(proxy);

  const proxyHost = readField("hostname") || readField("host");
  options["hostname"] = proxyHost;
  options["host"] = proxyHost;
  options["port"] = readField("port");
  options["path"] = location;

  const proxyProtocol = readField("protocol");
  if (proxyProtocol) {
    options["protocol"] = String(proxyProtocol).includes(":")
      ? String(proxyProtocol)
      : `${proxyProtocol}:`;
  }
}

function stripProxyAuthHeaders(options: Record<string, unknown>): void {
  if (!options["headers"]) return;
  for (const name of Object.keys(options["headers"])) {
    if (name.toLowerCase() === "proxy-authorization") {
      delete (options["headers"] as Record<string, unknown>)[name];
    }
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
    if (proxyUrl && !shouldBypassProxy(location)) {
      proxy = new URL(proxyUrl);
    }
  }

  if (isRedirect) {
    stripProxyAuthHeaders(options);
    if (options["agent"] && (options["agent"] as Record<symbol, unknown>)[kAxiosInstalledTunnel]) {
      options["agent"] = undefined;
    }
  }

  if (proxy) {
    const proxyAuth = resolveProxyAuth(proxy);
    const targetIsHttps = isHttps.test(String(options["protocol"]));
    if (targetIsHttps) {
      setupHttpsProxy(options, proxy, proxyAuth, configHttpsAgent);
    }
    else {
      setupHttpProxy(options, proxy, proxyAuth, location);
    }
  }

  (options["beforeRedirects"] as Record<string, unknown>)["proxy"] =
    function beforeRedirect(redirectOptions: unknown) {
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

type AxiosHeadersExtended = AxiosHeaders & {
  setContentType: (value: unknown, rewrite?: unknown) => void;
  setContentLength: (value: unknown, rewrite?: unknown) => void;
  getContentLength: (matcher?: unknown) => unknown;
  getContentType: (matcher?: unknown) => unknown;
  hasContentLength: (matcher?: unknown) => boolean;
};

function handleDataURI(
  resolve: (value: unknown) => void,
  reject: (reason?: unknown) => void,
  config: InternalAxiosRequestConfig,
  own: (key: string) => unknown,
  method: string,
  maxContentLength: unknown,
  responseType: unknown,
  responseEncoding: unknown,
  fullPath: string
): boolean {
  if ((maxContentLength as number) > -1) {
    const dataUrl = String(own("url") || fullPath || "");
    const estimated = estimateDataURLDecodedBytes(dataUrl);
    if (estimated > (maxContentLength as number)) {
      reject(
        new AxiosError(
          "maxContentLength size of " + String(maxContentLength) + " exceeded",
          AxiosError.ERR_BAD_RESPONSE,
          config
        )
      );
      return true;
    }
  }

  if (method !== "GET") {
    settle(resolve, reject, {
      status: 405,
      statusText: "method not allowed",
      headers: {},
      config,
      data: undefined,
      request: undefined,
    });
    return true;
  }

  let convertedData: unknown;
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
    throw AxiosError.from(err as Error, AxiosError.ERR_BAD_REQUEST, config);
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
    convertedData = stream.Readable.from(convertedData as Iterable<unknown>);
  }

  settle(resolve, reject, {
    data: convertedData,
    status: 200,
    statusText: "OK",
    headers: new AxiosHeaders(),
    config,
    request: undefined,
  });
  return true;
}

async function applyFormDataHeaders(
  data: unknown,
  headers: AxiosHeadersExtended,
  own: (key: string) => unknown
): Promise<void> {
  const dataWithHeaders = data as {
    getHeaders: () => Record<string, unknown>;
    getLength: (cb: (err: Error | null, len: number) => void) => void;
  };
  setFormDataHeaders(headers, dataWithHeaders.getHeaders(), own("formDataHeaderPolicy"));
  if (!headers.hasContentLength()) {
    try {
      const knownLength = await util.promisify(dataWithHeaders.getLength).call(data);
      Number.isFinite(knownLength) && knownLength >= 0 && headers.setContentLength(knownLength);
      /*eslint no-empty:0*/
    }
    catch {}
  }
}

function toBufferData(data: unknown): { data: Buffer | null; invalid: boolean; } {
  if (Buffer.isBuffer(data)) return { data, invalid: false };
  if (utils.isArrayBuffer(data)) return { data: Buffer.from(new Uint8Array(data as ArrayBuffer)), invalid: false };
  if (utils.isString(data)) return { data: Buffer.from(data as string, "utf-8"), invalid: false };
  return { data: null, invalid: true };
}

async function prepareRequestData(
  data: unknown,
  headers: AxiosHeadersExtended,
  own: (key: string) => unknown,
  maxBodyLength: unknown,
  reject: (reason?: unknown) => void,
  config: InternalAxiosRequestConfig
): Promise<{ data: unknown; rejected: boolean; }> {
  if (utils.isSpecCompliantForm(data)) {
    const userBoundary = headers.getContentType(/boundary=([-\w]{10,70})/i);
    data = formDataToStream(
      data,
      (formHeaders: Record<string, unknown>) => {
        headers.set(formHeaders);
      },
      {
        tag: `axios-${VERSION}-boundary`,
        boundary: ((userBoundary && (userBoundary as RegExpMatchArray)[1]) || undefined) as string | undefined,
      }
    );
  }
  else if (
    utils.isFormData(data) &&
    utils.isFunction((data as Record<string, unknown>)["getHeaders"])
  ) {
    await applyFormDataHeaders(data, headers, own);
  }
  else if (utils.isBlob(data) || utils.isFile(data)) {
    const blobData = data as { size: number; type: string; };
    blobData.size && headers.setContentType(blobData.type || "application/octet-stream");
    headers.setContentLength(blobData.size || 0);
    data = stream.Readable.from(readBlob(data as Parameters<typeof readBlob>[0]));
  }
  else if (data && !utils.isStream(data)) {
    const { data: buf, invalid } = toBufferData(data);
    if (invalid) {
      reject(
        new AxiosError(
          "Data after transformation must be a string, an ArrayBuffer, a Buffer, or a Stream",
          AxiosError.ERR_BAD_REQUEST,
          config
        )
      );
      return { data, rejected: true };
    }
    data = buf;
    headers.setContentLength((data as Buffer).length, false);
    if (
      (maxBodyLength as number) > -1 &&
      (data as Buffer).length > (maxBodyLength as number)
    ) {
      reject(
        new AxiosError(
          "Request body larger than maxBodyLength limit",
          AxiosError.ERR_BAD_REQUEST,
          config
        )
      );
      return { data, rejected: true };
    }
  }
  return { data, rejected: false };
}

type TransportType = {
  request: (options: unknown, cb: (res: unknown) => void) => unknown;
};

function setupSensitiveHeaders(
  options: Record<string, unknown>,
  own: (key: string) => unknown,
  reject: (reason?: unknown) => void,
  config: InternalAxiosRequestConfig
): boolean {
  const sensitiveHeaders = own("sensitiveHeaders");
  if (sensitiveHeaders == null) return false;
  if (!utils.isArray(sensitiveHeaders)) {
    reject(new AxiosError("sensitiveHeaders must be an array of strings", AxiosError.ERR_BAD_OPTION_VALUE, config));
    return true;
  }
  const sensitiveSet = new Set<string>();
  for (const header of sensitiveHeaders as Array<unknown>) {
    if (!utils.isString(header)) {
      reject(new AxiosError("sensitiveHeaders must be an array of strings", AxiosError.ERR_BAD_OPTION_VALUE, config));
      return true;
    }
    sensitiveSet.add((header as string).toLowerCase());
  }
  if (sensitiveSet.size) {
    options["sensitiveHeaders"] = Array.from(sensitiveSet);
    (options["beforeRedirects"] as Record<string, unknown>)["sensitiveHeaders"] =
      function beforeRedirectSensitiveHeaders(redirectOptions: unknown, requestDetails: unknown) {
        if (!isSameOriginRedirect(
          redirectOptions as Record<string, unknown>,
          requestDetails as { url?: string; } | undefined
        )) {
          stripMatchingHeaders(
            (redirectOptions as Record<string, unknown>)["headers"] as Record<string, unknown> | undefined,
            sensitiveSet
          );
        }
      };
  }
  return false;
}

function setupAuthRedirect(
  options: Record<string, unknown>,
  auth: string,
  requestOrigin: string
): void {
  const authToRestore = auth;
  (options["beforeRedirects"] as Record<string, unknown>)["auth"] =
    function beforeRedirectAuth(redirectOptions: unknown) {
      try {
        if (new URL(String((redirectOptions as Record<string, unknown>)["href"])).origin === requestOrigin) {
          (redirectOptions as Record<string, unknown>)["auth"] = authToRestore;
        }
      }
      catch {
        // ignore malformed URL: leaving auth stripped is fail-safe
      }
    };
}

function setupFollowRedirectsTransport(
  options: Record<string, unknown>,
  own: (key: string) => unknown,
  isHttpsRequest: boolean,
  maxRedirects: unknown,
  auth: string | undefined,
  parsed: URL,
  reject: (reason?: unknown) => void,
  config: InternalAxiosRequestConfig
): { transport: TransportType; rejected: boolean; } {
  options["sensitiveHeaders"] = [];
  if (maxRedirects) options["maxRedirects"] = maxRedirects;
  const configBeforeRedirect = own("beforeRedirect");
  if (configBeforeRedirect) {
    (options["beforeRedirects"] as Record<string, unknown>)["config"] = configBeforeRedirect;
  }
  if (auth) setupAuthRedirect(options, auth, parsed.origin);
  if (setupSensitiveHeaders(options, own, reject, config)) {
    return { transport: http2Transport, rejected: true };
  }
  return { transport: (isHttpsRequest ? httpsFollow : httpFollow) as TransportType, rejected: false };
}

function selectTransport(
  options: Record<string, unknown>,
  own: (key: string) => unknown,
  isHttp2: boolean,
  isHttpsRequest: boolean,
  maxRedirects: unknown,
  auth: string | undefined,
  parsed: URL,
  reject: (reason?: unknown) => void,
  config: InternalAxiosRequestConfig
): {
  transport: TransportType;
  isNativeTransport: boolean;
  transportEnforcesMaxBodyLength: boolean;
  rejected: boolean;
} {
  if (isHttp2) {
    return { transport: http2Transport, isNativeTransport: false, transportEnforcesMaxBodyLength: false, rejected: false };
  }

  const configTransport = own("transport");
  if (configTransport) {
    return { transport: configTransport as TransportType, isNativeTransport: false, transportEnforcesMaxBodyLength: false, rejected: false };
  }

  if (maxRedirects === 0) {
    return {
      transport: (isHttpsRequest ? https : http) as TransportType,
      isNativeTransport: true,
      transportEnforcesMaxBodyLength: false,
      rejected: false,
    };
  }

  const { transport, rejected } = setupFollowRedirectsTransport(options, own, isHttpsRequest, maxRedirects, auth, parsed, reject, config);
  return { transport, isNativeTransport: false, transportEnforcesMaxBodyLength: !rejected, rejected };
}

interface ResponseContext {
  req: unknown;
  rejected: { value: boolean; };
  abort: (reason?: unknown) => void;
  abortEmitter: EventEmitter;
  config: InternalAxiosRequestConfig;
  decompress: unknown;
  method: string;
  onDownloadProgress: unknown;
  maxDownloadRate: number | undefined;
  responseType: unknown;
  responseEncoding: unknown;
  maxContentLength: unknown;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  clearConnectPhaseTimer: () => void;
}

function handleBufferedResponse(
  responseStream: stream.Readable,
  ctx: ResponseContext,
  response: { status: number; statusText: string; headers: AxiosHeaders; config: InternalAxiosRequestConfig; request: unknown; data: unknown; },
  lastRequest: unknown
): void {
  const responseBuffer: Array<Buffer> = [];
  let totalResponseBytes = 0;

  responseStream.on("data", function handleStreamData(chunk: Buffer) {
    responseBuffer.push(chunk);
    totalResponseBytes += chunk.length;
    if ((ctx.maxContentLength as number) > -1 && totalResponseBytes > (ctx.maxContentLength as number)) {
      ctx.rejected.value = true;
      (responseStream).destroy();
      ctx.abort(new AxiosError(
        "maxContentLength size of " + String(ctx.maxContentLength) + " exceeded",
        AxiosError.ERR_BAD_RESPONSE,
        ctx.config,
        lastRequest
      ));
    }
  });

  responseStream.on("aborted", function handlerStreamAborted() {
    if (ctx.rejected.value) return;
    const err = new AxiosError("stream has been aborted", AxiosError.ERR_BAD_RESPONSE, ctx.config, lastRequest, response);
    (responseStream).destroy(err);
    ctx.reject(err);
  });

  responseStream.on("error", function handleStreamError(err: Error) {
    if (ctx.rejected.value) return;
    ctx.reject(AxiosError.from(err, undefined, ctx.config, lastRequest, response));
  });

  responseStream.on("end", function handleStreamEnd() {
    try {
      let responseData: Buffer | string =
        responseBuffer.length === 1
          ? responseBuffer[0]!
          : Buffer.concat(responseBuffer as unknown as Uint8Array[]);
      if (ctx.responseType !== "arraybuffer") {
        responseData = responseData.toString(ctx.responseEncoding as BufferEncoding);
        if (!ctx.responseEncoding || ctx.responseEncoding === "utf8") {
          responseData = utils.stripBOM(responseData);
        }
      }
      response.data = responseData;
    }
    catch (err) {
      return ctx.reject(AxiosError.from(err as Error, undefined, ctx.config, response.request, response));
    }
    settle(ctx.resolve, ctx.reject, response);
  });
}

function makeHandleResponse(ctx: ResponseContext): (res: unknown) => void {
  return function handleResponse(res: unknown): void {
    ctx.clearConnectPhaseTimer();

    const resObj = res as http.IncomingMessage & { req?: http.ClientRequest; };
    if ((ctx.req as http.ClientRequest).destroyed) return;

    const streams: Array<stream.Stream | stream.Readable> = [ resObj ];
    const responseLength = utils.toFiniteNumber(resObj.headers["content-length"]);

    if (ctx.onDownloadProgress || ctx.maxDownloadRate) {
      const transformStream = new AxiosTransformStream({ maxRate: utils.toFiniteNumber(ctx.maxDownloadRate) });
      ctx.onDownloadProgress &&
        transformStream.on(
          "progress",
          flushOnFinish(
            transformStream,
            progressEventDecorator(
              responseLength,
              progressEventReducer(asyncDecorator(ctx.onDownloadProgress as (...args: Array<unknown>) => unknown), true, 3)
            )
          ) as (...args: Array<unknown>) => void
        );
      streams.push(transformStream);
    }

    let responseStream: stream.Stream | stream.Readable = resObj;
    const lastRequest = resObj.req || ctx.req;

    if (ctx.decompress !== false && resObj.headers["content-encoding"]) {
      applyDecompression(streams, resObj, ctx.method);
    }

    responseStream = streams.length > 1
      ? (stream.pipeline as unknown as (streams: Array<unknown>, cb: unknown) => stream.Readable)(streams, utils.noop)
      : streams[0]!;

    const response = {
      status: resObj.statusCode ?? 0,
      statusText: resObj.statusMessage ?? "",
      headers: new AxiosHeaders(resObj.headers),
      config: ctx.config,
      request: lastRequest,
      data: undefined as unknown,
    };

    if (ctx.responseType === "stream") {
      if ((ctx.maxContentLength as number) > -1) {
        const limit = ctx.maxContentLength as number;
        const source = responseStream;
        async function* enforceMaxContentLength() {
          let totalResponseBytes = 0;
          for await (const chunk of source as unknown as AsyncIterable<Buffer>) {
            totalResponseBytes += chunk.length;
            if (totalResponseBytes > limit) {
              throw new AxiosError(
                "maxContentLength size of " + limit + " exceeded",
                AxiosError.ERR_BAD_RESPONSE,
                ctx.config,
                lastRequest
              );
            }
            yield chunk;
          }
        }
        responseStream = stream.Readable.from(enforceMaxContentLength(), { objectMode: false });
      }
      response.data = responseStream;
      settle(ctx.resolve, ctx.reject, response);
    }
    else {
      handleBufferedResponse(responseStream as stream.Readable, ctx, response, lastRequest);
    }

    ctx.abortEmitter.once("abort", (err: unknown) => {
      const readableStream = responseStream as stream.Readable;
      if (!readableStream.destroyed) {
        readableStream.emit("error", err);
        readableStream.destroy();
      }
    });
  };
}

type LookupFn = (
  hostname: string,
  opt: Record<string, unknown>,
  cb: (err: Error | null, ...args: Array<unknown>) => void
) => void;

interface AbortContext {
  abortEmitter: EventEmitter;
  config: InternalAxiosRequestConfig;
  req: unknown;
}

function makeAbort(ctx: AbortContext): (reason?: unknown) => void {
  return function abort(reason?: unknown): void {
    try {
      ctx.abortEmitter.emit(
        "abort",
        !reason || (reason as Record<string, unknown>)["type"]
          ? new CanceledError(null, ctx.config, ctx.req)
          : reason
      );
    }
    catch {
      // ignore emit errors
    }
  };
}

interface OnFinishedContext {
  clearConnectPhaseTimer: () => void;
  config: InternalAxiosRequestConfig;
  abort: (reason?: unknown) => void;
  abortEmitter: EventEmitter;
}

function makeOnFinished(ctx: OnFinishedContext): () => void {
  return (): void => {
    ctx.clearConnectPhaseTimer();
    if (ctx.config.cancelToken) {
      ctx.config.cancelToken.unsubscribe(ctx.abort);
    }
    if (ctx.config.signal) {
      ctx.config.signal.removeEventListener &&
        ctx.config.signal.removeEventListener("abort", ctx.abort);
    }
    ctx.abortEmitter.removeAllListeners();
  };
}

function makeOnDoneHandler(
  isDone: { value: boolean | undefined; },
  rejected: { value: boolean; },
  clearConnectPhaseTimer: () => void,
  onFinished: () => void
): (response: unknown, isRejected?: boolean) => void {
  return (response: unknown, isRejected?: boolean): void => {
    isDone.value = true;
    clearConnectPhaseTimer();
    if (isRejected) {
      rejected.value = true;
      onFinished();
      return;
    }
    const responseData = (response as Record<string, unknown>)["data"];
    if (responseData instanceof stream.Readable || responseData instanceof stream.Duplex) {
      const offListeners = stream.finished(responseData, () => {
        offListeners();
        onFinished();
      });
    }
    else {
      onFinished();
    }
  };
}

function buildRequestOptions(
  own: (key: string) => unknown,
  path: string,
  method: string,
  headers: AxiosHeadersExtended,
  httpAgent: unknown,
  httpsAgent: unknown,
  auth: string | undefined,
  protocol: string,
  family: unknown,
  http2Options: unknown,
  lookup: unknown,
  maxBodyLength: unknown,
  parsed: URL,
  reject: (reason?: unknown) => void,
  config: InternalAxiosRequestConfig
): { options: Record<string, unknown> | null; } {
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

  !utils.isUndefined(lookup) && (options["lookup"] = lookup);

  const socketPath = own("socketPath");
  if (socketPath) {
    if (validateSocketPath(socketPath, own, reject, config)) return { options: null };
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
      protocol + "//" + parsed.hostname + (parsed.port ? ":" + parsed.port : "") + String(options["path"]),
      false,
      httpsAgent
    );
  }

  options["maxBodyLength"] = (maxBodyLength as number) > -1 ? maxBodyLength : Infinity;
  options["insecureHTTPParser"] = Boolean(own("insecureHTTPParser"));

  return { options };
}

function attachReqDestroyOnAbort(abortEmitter: EventEmitter, ctx: AbortContext): void {
  abortEmitter.once("abort", (err: unknown) => {
    const reqObj = ctx.req as { close?: () => void; destroy: (err?: unknown) => void; };
    if (reqObj.close) reqObj.close();
    else reqObj.destroy(err);
  });
}

function resolveMaxRates(maxRate: unknown): { maxUploadRate: number | undefined; maxDownloadRate: number | undefined; } {
  if (utils.isArray(maxRate)) {
    return { maxUploadRate: maxRate[0] as number, maxDownloadRate: maxRate[1] as number };
  }
  return { maxUploadRate: maxRate as number, maxDownloadRate: maxRate as number };
}

function buildAuth(own: (key: string) => unknown, parsed: URL): string | undefined {
  const configAuth = own("auth");
  if (configAuth) {
    const username = String(utils.getSafeProp(configAuth, "username") || "");
    const password = String(utils.getSafeProp(configAuth, "password") || "");
    return username + ":" + password;
  }
  if (parsed.username || parsed.password) {
    const urlUsername = decodeURIComponentSafe(parsed.username);
    const urlPassword = decodeURIComponentSafe(parsed.password);
    return String(urlUsername) + ":" + String(urlPassword);
  }
  return undefined;
}

function buildRequestPath(
  own: (key: string) => unknown,
  parsed: URL,
  reject: (reason?: unknown) => void,
  config: InternalAxiosRequestConfig
): { path: string; rejected: boolean; } {
  try {
    const path = buildURL(
      parsed.pathname + parsed.search,
      own("params"),
      own("paramsSerializer")
    ).replace(/^\?/, "");
    return { path, rejected: false };
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
    reject(customErr);
    return { path: "", rejected: true };
  }
}

function setupCancellation(
  config: InternalAxiosRequestConfig,
  abort: (reason?: unknown) => void
): void {
  if (!config.cancelToken && !config.signal) return;
  config.cancelToken && config.cancelToken.subscribe(abort);
  if (config.signal) {
    config.signal.aborted
      ? abort()
      : config.signal.addEventListener && config.signal.addEventListener("abort", abort);
  }
}

function resolveDefaultAgent(
  options: Record<string, unknown>,
  isHttpsRequest: boolean,
  httpsAgent: unknown,
  httpAgent: unknown
): void {
  if (options["agent"] == null) {
    options["agent"] = isHttpsRequest ? httpsAgent : httpAgent;
  }
}

function resolveAcceptEncoding(transitional: typeof transitionalDefaults): string {
  return utils.hasOwnProp(transitional, "advertiseZstdAcceptEncoding") &&
    (transitional as Record<string, unknown>)["advertiseZstdAcceptEncoding"] === true
    ? ACCEPT_ENCODING_WITH_ZSTD
    : ACCEPT_ENCODING;
}

function applyUploadProgressIfNeeded(
  data: unknown,
  onUploadProgress: unknown,
  maxUploadRate: number | undefined,
  contentLength: number | null
): unknown {
  return (data && (onUploadProgress || maxUploadRate))
    ? applyUploadProgress(data, onUploadProgress, maxUploadRate, contentLength)
    : data;
}

function applyUploadProgress(
  data: unknown,
  onUploadProgress: unknown,
  maxUploadRate: number | undefined,
  contentLength: number | null
): unknown {
  if (!utils.isStream(data)) {
    data = stream.Readable.from(data as Iterable<unknown>, { objectMode: false });
  }
  data = (
    stream.pipeline as unknown as (streams: Array<unknown>, cb: unknown) => stream.Readable
  )([ data, new AxiosTransformStream({ maxRate: utils.toFiniteNumber(maxUploadRate) }) ], utils.noop);
  onUploadProgress &&
    (data as stream.Stream).on(
      "progress",
      flushOnFinish(
        data as stream.Stream,
        progressEventDecorator(
          contentLength ?? undefined,
          progressEventReducer(asyncDecorator(onUploadProgress as (...args: Array<unknown>) => unknown), false, 3)
        )
      ) as (...args: Array<unknown>) => void
    );
  return data;
}

function validateSocketPath(
  socketPath: unknown,
  own: (key: string) => unknown,
  reject: (reason?: unknown) => void,
  config: InternalAxiosRequestConfig
): boolean {
  if (typeof socketPath !== "string") {
    reject(new AxiosError("socketPath must be a string", AxiosError.ERR_BAD_OPTION_VALUE, config));
    return true;
  }
  const allowedSocketPaths = own("allowedSocketPaths");
  if (allowedSocketPaths == null) return false;
  const allowed = Array.isArray(allowedSocketPaths)
    ? (allowedSocketPaths as Array<string>)
    : [ allowedSocketPaths as string ];
  const resolvedSocket = resolvePath(socketPath);
  const isAllowed = allowed.some(
    (entry: unknown) => typeof entry === "string" && resolvePath(entry) === resolvedSocket
  );
  if (!isAllowed) {
    reject(new AxiosError(`socketPath "${socketPath}" is not permitted by allowedSocketPaths`, AxiosError.ERR_BAD_OPTION_VALUE, config));
    return true;
  }
  return false;
}

function resolveHttpVersion(own: (key: string) => unknown, config: InternalAxiosRequestConfig): number {
  let httpVersion: unknown = own("httpVersion");
  if (httpVersion === undefined) httpVersion = 1;
  const v = Number(httpVersion);
  if (Number.isNaN(v)) {
    throw TypeError(
      `Invalid protocol version: '${String((config as unknown as Record<string, unknown>)["httpVersion"])}' is not a number`
    );
  }
  if (v !== 1 && v !== 2) throw TypeError(`Unsupported protocol version '${v}'`);
  return v;
}

function clearConnectPhaseTimerRef(ref: { value: ReturnType<typeof setTimeout> | undefined; }): void {
  if (ref.value) {
    clearTimeout(ref.value);
    ref.value = undefined;
  }
}

function makeTimeoutError(
  own: (key: string) => unknown,
  transitional: typeof transitionalDefaults,
  config: InternalAxiosRequestConfig,
  getReq: () => unknown
): AxiosError {
  const configTimeout = own("timeout");
  const timeoutMsg = configTimeout
    ? "timeout of " + String(configTimeout) + "ms exceeded"
    : "timeout exceeded";
  const customMsg = own("timeoutErrorMessage");
  return new AxiosError(
    customMsg ? String(customMsg) : timeoutMsg,
    transitional.clarifyTimeoutError ? AxiosError.ETIMEDOUT : AxiosError.ECONNABORTED,
    config,
    getReq()
  );
}

function setupRequestTimeout(
  req: unknown,
  own: (key: string) => unknown,
  abort: (reason?: unknown) => void,
  transitional: typeof transitionalDefaults,
  isDone: { value: boolean | undefined; },
  isNativeTransport: boolean,
  config: InternalAxiosRequestConfig,
  abortCtx: AbortContext
): { connectPhaseTimer: ReturnType<typeof setTimeout> | undefined; aborted: boolean; } {
  const configTimeout = own("timeout");
  if (!configTimeout) {
    (req as http.ClientRequest).setTimeout(0);
    return { connectPhaseTimer: undefined, aborted: false };
  }
  const timeout = parseInt(String(configTimeout), 10);
  if (Number.isNaN(timeout)) {
    abort(new AxiosError("error trying to parse `config.timeout` to int", AxiosError.ERR_BAD_OPTION_VALUE, config, req));
    return { connectPhaseTimer: undefined, aborted: true };
  }
  const handleTimeout = (): void => {
    if (isDone.value) return;
    abort(makeTimeoutError(own, transitional, config, () => abortCtx.req));
  };
  let connectPhaseTimer: ReturnType<typeof setTimeout> | undefined;
  if (isNativeTransport && timeout > 0) {
    connectPhaseTimer = setTimeout(handleTimeout, timeout);
  }
  (req as http.ClientRequest).setTimeout(timeout, handleTimeout);
  return { connectPhaseTimer, aborted: false };
}

function wrapLookup(lookup: unknown): LookupFn {
  const _lookup = callbackify(
    lookup as (...args: Array<unknown>) => unknown,
    (value: unknown) =>
      utils.isArray(value) ? (value as Array<unknown>) : [ value ]
  ) as LookupFn;

  return function wrappedLookup(
    hostname: string,
    opt: Record<string, unknown>,
    cb: (err: Error | null, ...args: Array<unknown>) => void
  ) {
    _lookup(hostname, opt, (err: Error | null, arg0: unknown, arg1: unknown) => {
      if (err) return cb(err);
      const addresses = utils.isArray(arg0)
        ? (arg0 as Array<unknown>).map((addr: unknown) => buildAddressEntry(addr))
        : [ buildAddressEntry(arg0, arg1) ];
      opt["all"] ? cb(null, addresses) : cb(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}

function setupSocketTracking(
  req: unknown,
  boundSockets: Set<net.Socket & Record<symbol, unknown>>,
  clearConnectPhaseTimer: () => void
): void {
  (req as http.ClientRequest).on("socket", function handleRequestSocket(socket: net.Socket) {
    socket.setKeepAlive(true, 1000 * 60);
    const s = socket as net.Socket & Record<symbol, unknown>;
    if (!s[kAxiosSocketListener]) {
      socket.on("error", function handleSocketError(err: Error) {
        const current = s[kAxiosCurrentReq] as (http.ClientRequest & { destroyed: boolean; }) | null;
        if (current && !current.destroyed) {
          current.destroy(err);
        }
      });
      s[kAxiosSocketListener] = true;
    }
    s[kAxiosCurrentReq] = req;
    boundSockets.add(s);
  });

  (req as http.ClientRequest).once("close", function clearCurrentReq() {
    clearConnectPhaseTimer();
    for (const socket of boundSockets) {
      if (socket[kAxiosCurrentReq] === req) {
        socket[kAxiosCurrentReq] = null;
      }
    }
    boundSockets.clear();
  });
}

function pipeStreamData(
  data: unknown,
  req: unknown,
  abort: (reason?: unknown) => void,
  maxBodyLength: unknown,
  transportEnforcesMaxBodyLength: boolean,
  config: InternalAxiosRequestConfig
): void {
  let ended = false;
  let errored = false;

  (data as stream.Readable).on("end", () => { ended = true; });
  (data as stream.Readable).once("error", (err: Error) => {
    errored = true;
    (req as http.ClientRequest).destroy(err);
  });
  (data as stream.Readable).on("close", () => {
    if (!ended && !errored) {
      abort(new CanceledError("Request stream has been aborted", config, req));
    }
  });

  let uploadStream: stream.Stream = data as stream.Readable;
  if ((maxBodyLength as number) > -1 && !transportEnforcesMaxBodyLength) {
    const limit = maxBodyLength as number;
    let bytesSent = 0;
    uploadStream = (
      stream.pipeline as unknown as (streams: Array<unknown>, cb: unknown) => stream.Readable
    )(
      [
        data,
        new stream.Transform({
          transform(chunk: Buffer, _enc: BufferEncoding, cb: (err?: Error | null, data?: Buffer) => void) {
            bytesSent += chunk.length;
            if (bytesSent > limit) {
              return cb(new AxiosError("Request body larger than maxBodyLength limit", AxiosError.ERR_BAD_REQUEST, config, req));
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

function applyDecompression(
  streams: Array<stream.Stream | stream.Readable>,
  resObj: http.IncomingMessage,
  method: string
): void {
  if (method === "HEAD" || resObj.statusCode === 204) {
    delete resObj.headers["content-encoding"];
    return;
  }
  switch ((resObj.headers["content-encoding"] || "").toLowerCase()) {
    /*eslint default-case:0*/
    case "gzip":
    case "x-gzip":
    case "compress":
    case "x-compress":
      streams.push(zlib.createUnzip(zlibOptions));
      delete resObj.headers["content-encoding"];
      break;
    case "deflate":
      streams.push(new ZlibHeaderTransformStream());
      streams.push(zlib.createUnzip(zlibOptions));
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

/*eslint consistent-return:0*/
export default isHttpAdapterSupported &&
  async function httpAdapter(config: InternalAxiosRequestConfig) {
    // Read config pollution-safely: own properties and members inherited from
    // a non-Object.prototype source (e.g. an Object.create(defaults) template)
    // are honored, but values injected onto a polluted Object.prototype are
    // ignored. All behavior-affecting reads in this adapter go through own()
    // so the protection boundary stays consistent.
    const own = (key: string): unknown => utils.getSafeProp(config, key);
    return wrapAsync(
      async function dispatchHttpRequest(resolve, reject, onDone) {
        const transitional = (own("transitional") || transitionalDefaults) as typeof transitionalDefaults;
        let data: unknown = own("data");
        let lookup: unknown = own("lookup");
        let family: unknown = own("family");
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
        const isDone = { value: undefined as boolean | undefined };
        const rejected = { value: false };
        let req: unknown;
        const connectPhaseTimer = { value: undefined as ReturnType<typeof setTimeout> | undefined };

        const httpVersion = resolveHttpVersion(own, config);
        const isHttp2 = httpVersion === 2;

        if (lookup) {
          // hotfix to support opt.all option which is required for node 20.x
          lookup = wrapLookup(lookup);
        }

        const abortEmitter = new EventEmitter();
        const abortCtx: AbortContext = { abortEmitter, config, req };
        const abort = makeAbort(abortCtx);

        const clearConnectPhaseTimer = (): void => clearConnectPhaseTimerRef(connectPhaseTimer);

        abortEmitter.once("abort", reject);

        const onFinished = makeOnFinished({ clearConnectPhaseTimer, config, abort, abortEmitter });
        setupCancellation(config, abort);
        onDone(makeOnDoneHandler(isDone, rejected, clearConnectPhaseTimer, onFinished));

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
          handleDataURI(resolve, reject, config, own, method, maxContentLength, responseType, responseEncoding, fullPath);
          return;
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
        ) as AxiosHeadersExtended;

        headers.set("User-Agent", "axios/" + VERSION, false);

        const { onUploadProgress, onDownloadProgress } = config;
        const maxRate = config.maxRate;
        let maxUploadRate: number | undefined = undefined;
        let maxDownloadRate: number | undefined = undefined;

        {
          const result = await prepareRequestData(data, headers, own, maxBodyLength, reject, config);
          if (result.rejected) return;
          data = result.data;
        }

        const contentLength = utils.toFiniteNumber(headers.getContentLength());

        ({ maxUploadRate, maxDownloadRate } = resolveMaxRates(maxRate));

        data = applyUploadProgressIfNeeded(data, onUploadProgress, maxUploadRate, contentLength ?? null);

        // HTTP basic authentication
        const auth = buildAuth(own, parsed);
        if (auth) headers.delete("authorization");

        const pathResult = buildRequestPath(own, parsed, reject, config);
        if (pathResult.rejected) return;
        const path = pathResult.path;

        headers.set("Accept-Encoding", resolveAcceptEncoding(transitional), false);

        const { options } = buildRequestOptions(own, path, method, headers, httpAgent, httpsAgent, auth, protocol, family, http2Options, lookup, maxBodyLength, parsed, reject, config);
        if (!options) return;

        const isHttpsRequest = isHttps.test(String(options["protocol"]));
        resolveDefaultAgent(options, isHttpsRequest, httpsAgent, httpAgent);

        const transportResult = selectTransport(
          options, own, isHttp2, isHttpsRequest, maxRedirects, auth, parsed, reject, config
        );
        if (transportResult.rejected) return;
        const { transport, isNativeTransport, transportEnforcesMaxBodyLength } = transportResult;

        // Create the request

        const responseCtx: ResponseContext = {
          req,
          rejected,
          abort,
          abortEmitter,
          config,
          decompress,
          method,
          onDownloadProgress,
          maxDownloadRate,
          responseType,
          responseEncoding,
          maxContentLength,
          resolve,
          reject,
          clearConnectPhaseTimer,
        };

        req = transport.request(options, makeHandleResponse(responseCtx));
        responseCtx.req = req;
        abortCtx.req = req;

        attachReqDestroyOnAbort(abortEmitter, abortCtx);

        // Handle errors
        (req as http.ClientRequest).on("error", (err: Error) => reject(AxiosError.from(err, undefined, config, abortCtx.req)));

        const boundSockets = new Set<net.Socket & Record<symbol, unknown>>();
        setupSocketTracking(req, boundSockets, clearConnectPhaseTimer);

        // Handle request timeout
        {
          const result = setupRequestTimeout(req, own, abort, transitional, isDone, isNativeTransport, config, abortCtx);
          if (result.aborted) return;
          connectPhaseTimer.value = result.connectPhaseTimer;
        }

        // Send the request
        if (utils.isStream(data)) {
          pipeStreamData(data, req, abort, maxBodyLength, transportEnforcesMaxBodyLength, config);
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
