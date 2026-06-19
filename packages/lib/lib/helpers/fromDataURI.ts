"use strict";

import AxiosError from "../core/AxiosError.js";
import platform from "../platform/index.js";
import parseProtocol from "./parseProtocol.js";

// RFC 2397: data:[<mediatype>][;base64],<data>

function getMime(type: string | undefined, params: string): string | undefined {
  if (type) return params ? type + params : type;
  return params ? "text/plain" + params : undefined;
}

/**
 * Parse data uri to a Buffer or Blob
 *
 * @param {String} uri
 * @param {?Boolean} asBlob
 * @param {?Object} options
 * @param {?Function} options.Blob
 *
 * @returns {Buffer|Blob}
 */

export default function fromDataURI(
  uri: string,
  asBlob?: boolean,
  options?: { Blob?: new (...args: Array<unknown>) => object; }
) {
  const _Blob = ((options && options.Blob) || platform.classes.Blob) as
    | (new (...args: Array<unknown>) => object)
    | null
    | undefined;
  const protocol = parseProtocol(uri);

  if (asBlob === undefined && _Blob) {
    asBlob = true;
  }

  if (protocol !== "data") {
    throw new AxiosError(
      "Unsupported protocol " + protocol,
      AxiosError.ERR_NOT_SUPPORT
    );
  }

  uri = protocol.length ? uri.slice(protocol.length + 1) : uri;

  const commaIdx = uri.indexOf(',');
  if (commaIdx < 0) {
    throw new AxiosError("Invalid URL", AxiosError.ERR_INVALID_URL);
  }

  const header = uri.slice(0, commaIdx);
  const body = uri.slice(commaIdx + 1);
  const isBase64 = header.endsWith(';base64');
  const headerCore = isBase64 ? header.slice(0, -7) : header;
  const semiIdx = headerCore.indexOf(';');
  const type = (semiIdx >= 0 ? headerCore.slice(0, semiIdx) : headerCore) || undefined;
  const params = semiIdx >= 0 ? headerCore.slice(semiIdx) : '';
  const encoding: BufferEncoding = isBase64 ? "base64" : "utf8";
  const mime = getMime(type, params);
  const buffer = Buffer.from(decodeURIComponent(body), encoding);

  if (!asBlob) return buffer;

  if (!_Blob) {
    throw new AxiosError("Blob is not supported", AxiosError.ERR_NOT_SUPPORT);
  }

  return new _Blob([ buffer ], { type: mime });
}
