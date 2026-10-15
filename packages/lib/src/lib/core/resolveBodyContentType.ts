import { isFormData } from "../utils.js";
import type FaxiosHeaders from "./FaxiosHeaders.js";

/**
 * Decides the request body's Content-Type once the body is final, in every runtime. It is the one
 * place the fetch adapter changes Content-Type.
 *
 * A FormData body's header must carry the boundary the body was encoded with, and only the
 * encoder picks it, so faxios never sends a default or caller Content-Type for a FormData body:
 * it drops the header for fetch to fill in.
 *
 * When faxios had the body encoded ahead of fetch (the stream counted for `onUploadProgress` or
 * `maxBodyLength`), fetch only sees the stream and adds no Content-Type, so the one that encoding
 * produced is set: always for FormData, and for any other body only when the request has none
 * (a string still goes out as `text/plain;charset=UTF-8`, a Blob with its `type`).
 *
 * fetch sends a string body as `text/plain;charset=UTF-8` when there's no Content-Type. A
 * Content-Type of `null` or `false` keeps the header off, so that string is encoded to its bytes.
 *
 * @param preparedBody The request body as prepared, before any upload stream wraps it.
 * @param body The body that goes to fetch (the prepared body or its upload stream).
 * @param headers The request headers, updated in place.
 * @param encodedContentType The Content-Type from encoding the body ahead of fetch, if it was.
 * @param encode Encodes a string body to UTF-8 bytes.
 * @returns The body to send.
 */
export default function resolveBodyContentType(
  preparedBody: unknown,
  body: unknown,
  headers: FaxiosHeaders,
  encodedContentType: null | string | undefined,
  encode: (str: string) => Uint8Array
): unknown {
  if (isFormData(preparedBody)) headers.delete("content-type");
  if (encodedContentType) headers.setContentType(encodedContentType, false);

  if (typeof body !== "string") return body;
  const contentType = headers.get("content-type");
  return contentType === null || contentType === false ? encode(body) : body;
}
