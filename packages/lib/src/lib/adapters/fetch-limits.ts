"use strict";

import FaxiosError from "../core/FaxiosError.js";
import type FaxiosHeaders from "../core/FaxiosHeaders.js";
import estimateDataURLDecodedBytes from "../helpers/estimateDataURLDecodedBytes.js";
import utf8ByteLength from "../helpers/utf8ByteLength.js";
import { getSafeProp, isArrayBuffer, isArrayBufferView, isBlob, isSpecCompliantForm, isString, isURLSearchParams, toFiniteNumber } from "../utils.js";
import type { FetchContext } from "./fetch-helpers.js";

// A size limit is set when it is a number above -1.
export const limitOf = (value: unknown): number | undefined =>
  (typeof value === "number" && value > -1 ? value : undefined);

// The one place each size-limit error is defined.
export const contentTooLarge = (ctx: FetchContext): FaxiosError =>
  new FaxiosError(
    "maxContentLength size of " + String(ctx.limits.content) + " exceeded",
    FaxiosError.ERR_BAD_RESPONSE,
    ctx.config,
    ctx.request
  );

export const bodyTooLarge = (ctx: FetchContext): FaxiosError =>
  new FaxiosError(
    "Request body larger than maxBodyLength limit",
    FaxiosError.ERR_BAD_REQUEST,
    ctx.config,
    ctx.request
  );

// Sizes come from the body itself, never an encoded copy: measuring must not allocate a buffer
// as large as the body it may reject.
const getBodyLength = (body: unknown): number | undefined => {
  if (body == null) {
    return 0;
  }

  if (isBlob(body)) {
    return (body as { size: number; }).size;
  }

  if (isArrayBufferView(body) || isArrayBuffer(body)) {
    return (body as ArrayBuffer | ArrayBufferView).byteLength;
  }

  if (isURLSearchParams(body)) {
    body = body + "";
  }

  if (isString(body)) {
    return utf8ByteLength(body as string);
  }
  return undefined;
};

// The bytes of a FormData body's field values and files, from their sizes, without reading the
// body. A lower bound: the multipart body adds boundaries and part headers. Undefined for any
// other body.
const getFormDataFieldsLength = (body: unknown): number | undefined => {
  if (!isSpecCompliantForm(body)) {
    return undefined;
  }
  let length = 0;
  for (const [ , value ] of body as Iterable<[string, unknown]>) {
    // A FormData value is a string or a File.
    const size = isString(value) ? undefined : getSafeProp(value, "size");
    length += typeof size === "number" ? size : utf8ByteLength(String(value));
  }
  return length;
};

export const resolveBodyLength = (headers: FaxiosHeaders, body: unknown): number | undefined => {
  const length = toFiniteNumber(headers.getContentLength());

  return length == null ? getBodyLength(body) : length;
};

// Pre-flight size checks: data: URL content-length and known-size body maxBodyLength. They run
// before any Request exists. Returns the body's length if it was measured, else undefined.
export const checkPreflightLimits = (ctx: FetchContext, outbound: { data: unknown; url: string; }): number | undefined => {
  const { body: maxBodyLength, content: maxContentLength } = ctx.limits;
  // Enforce maxContentLength for data: URLs up-front so we never materialize
  // an oversized payload.
  if (
    maxContentLength !== undefined &&
    outbound.url.startsWith("data:") &&
    estimateDataURLDecodedBytes(outbound.url) > maxContentLength
  ) {
    throw contentTooLarge(ctx);
  }
  // Enforce maxBodyLength against known-size bodies before dispatch using
  // the body's actual size — never a caller-declared Content-Length.
  // A FormData body isn't measured, since that buffers it whole: its values alone over the limit
  // reject it here, and where it's streamed the byte counter covers the multipart framing too.
  if (maxBodyLength !== undefined && ctx.sendsBody) {
    const outboundLength = getBodyLength(outbound.data);
    const checkedLength = outboundLength ?? getFormDataFieldsLength(outbound.data);
    if (typeof checkedLength === "number" && isFinite(checkedLength)) {
      if (checkedLength > maxBodyLength) {
        throw bodyTooLarge(ctx);
      }
      return outboundLength;
    }
  }
  return undefined;
};

// A HEAD response and these statuses have no body, so their Content-Length isn't what they send.
const BODILESS_STATUSES: ReadonlyArray<number> = [ 204, 205, 304 ];

export const checkDeclaredContentLength = (
  ctx: FetchContext,
  response: { headers: FaxiosHeaders; status: number; }
): void => {
  const limit = ctx.limits.content;
  if (limit === undefined || ctx.method === "head" || BODILESS_STATUSES.includes(response.status)) return;
  const declaredLength = toFiniteNumber(response.headers.getContentLength());
  if (declaredLength != null && declaredLength > limit) {
    throw contentTooLarge(ctx);
  }
};

// The size of a body that was read whole, for a response the counting stream wrapper didn't read:
// a runtime without stream responses, or a Response-like value from `env.fetch` with no stream body.
export const checkMaterializedSize = (ctx: FetchContext, responseData: unknown): void => {
  const limit = ctx.limits.content;
  if (limit === undefined || responseData == null) return;
  let materializedSize: number | undefined;
  const rd = responseData as Record<string, unknown>;
  if (typeof rd["byteLength"] === "number") {
    materializedSize = rd["byteLength"];
  }
  else if (typeof rd["size"] === "number") {
    materializedSize = rd["size"];
  }
  else if (typeof responseData === "string") {
    materializedSize = utf8ByteLength(responseData);
  }
  if (typeof materializedSize === "number" && materializedSize > limit) {
    throw contentTooLarge(ctx);
  }
};
