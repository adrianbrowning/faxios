/**
 * The UTF-8 byte length of a string, counted from its UTF-16 code units, so measuring a large
 * string doesn't allocate an encoded copy of it. A lone surrogate counts as 3 bytes: the U+FFFD
 * that `TextEncoder` writes in its place.
 */
export default function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    }
    else if (code < 0x800) {
      bytes += 2;
    }
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < len && (str.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      // A surrogate pair is one code point above U+FFFF.
      bytes += 4;
      i++;
    }
    else {
      bytes += 3;
    }
  }
  return bytes;
}
