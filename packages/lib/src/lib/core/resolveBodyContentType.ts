import type { FaxiosRequestHeaders } from "../types.js";
import utils from "../utils.js";

/**
 * Decides the request body's Content-Type once the body is final, in every runtime.
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
 * @param data The request body as prepared, before any upload stream wraps it.
 * @param headers The request headers, updated in place.
 * @param encodedContentType The Content-Type from encoding the body ahead of fetch, if it was.
 */
export default function resolveBodyContentType(
  data: unknown,
  headers: FaxiosRequestHeaders,
  encodedContentType: null | string | undefined
): void {
  if (utils.isFormData(data)) headers.delete("content-type");
  if (encodedContentType) headers.setContentType(encodedContentType, false);
}
