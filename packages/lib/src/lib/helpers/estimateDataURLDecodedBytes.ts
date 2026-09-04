/**
 * Estimate decoded byte length of a data:// URL *without* allocating large buffers.
 * - For base64: compute exact decoded size using length and padding;
 *               handle %XX at the character-count level (no string allocation).
 * - For non-base64: compute the exact percent-decoded UTF-8 byte length.
 *
 * @param {string} url
 * @returns {number}
 */
const isHexDigit = (charCode: number) =>
  (charCode >= 48 && charCode <= 57) ||
  (charCode >= 65 && charCode <= 70) ||
  (charCode >= 97 && charCode <= 102);

const isPercentEncodedByte = (str: string, i: number, len: number) =>
  i + 2 < len &&
  isHexDigit(str.charCodeAt(i + 1)) &&
  isHexDigit(str.charCodeAt(i + 2));

function countBase64Padding(body: string, len: number): number {
  let pad = 0;
  let i = len;
  while (pad < 2 && i > 0) {
    if (body.charCodeAt(i - 1) === 61 /* '=' */) {
      pad++;
      i--;
    }
    else if (i >= 3 && body.charCodeAt(i - 3) === 37 /* '%' */ && body.charCodeAt(i - 2) === 51 /* '3' */ &&
               (body.charCodeAt(i - 1) === 68 || body.charCodeAt(i - 1) === 100) /* 'D'|'d' */) {
      pad++;
      i -= 3;
    }
    else {
      break;
    }
  }
  return pad;
}

function estimateBase64DecodedBytes(body: string): number {
  let effectiveLen = body.length;
  const len = body.length;

  for (let i = 0; i < len; i++) {
    if (body.charCodeAt(i) === 37 /* '%' */ && i + 2 < len) {
      const a = body.charCodeAt(i + 1);
      const b = body.charCodeAt(i + 2);
      if (isHexDigit(a) && isHexDigit(b)) {
        effectiveLen -= 2;
        i += 2;
      }
    }
  }

  const pad = countBase64Padding(body, len);
  const significant = effectiveLen - pad;

  // Forgiving-base64 decodes a trailing group of 2 or 3 significant characters
  // to 1 or 2 bytes. Flooring the group count would under-count those, and this
  // estimate gates maxContentLength before the body is materialized — it must
  // never come in under the real decoded size.
  const groups = Math.ceil(significant / 4);
  const bytes = groups * 3 - pad;
  return bytes > 0 ? bytes : 0;
}

// Returns [utf8Bytes, extraCharsToSkip]
function utf8CharBytes(body: string, i: number, len: number): [number, number] {
  const c = body.charCodeAt(i);
  if (c === 37 /* '%' */ && isPercentEncodedByte(body, i, len)) return [ 1, 2 ];
  if (c < 0x80) return [ 1, 0 ];
  if (c < 0x800) return [ 2, 0 ];
  if (c >= 0xd800 && c <= 0xdbff && i + 1 < len) {
    const next = body.charCodeAt(i + 1);
    if (next >= 0xdc00 && next <= 0xdfff) return [ 4, 1 ];
  }
  return [ 3, 0 ];
}

// Compute UTF-8 byte length directly from UTF-16 code units without allocating
// a byte buffer (TextEncoder.encode would defeat the DoS guard on large bodies).
function estimateUtf8BodyBytes(body: string): number {
  let bytes = 0;
  for (let i = 0, len = body.length; i < len; i++) {
    const [ b, skip ] = utf8CharBytes(body, i, len);
    bytes += b;
    i += skip;
  }
  return bytes;
}

export default function estimateDataURLDecodedBytes(url: string): number {
  if (!url || typeof url !== "string") return 0;
  if (!url.startsWith("data:")) return 0;

  // A #fragment is not part of the resource: fetch strips it before decoding,
  // so counting it would reject legal URLs that carry a large fragment.
  const hash = url.indexOf("#");
  const resource = hash === -1 ? url : url.slice(0, hash);

  const comma = resource.indexOf(",");
  if (comma < 0) return 0;

  const meta = resource.slice(5, comma);
  const body = resource.slice(comma + 1);
  return /;base64/i.test(meta) ? estimateBase64DecodedBytes(body) : estimateUtf8BodyBytes(body);
}
