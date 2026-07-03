"use strict";

import utils from "../utils.js";

function trimSPorHTAB(str: string): string {
  let start = 0;
  let end = str.length;

  while (start < end) {
    const code = str.charCodeAt(start);

    if (code !== 0x09 && code !== 0x20) {
      break;
    }

    start += 1;
  }

  while (end > start) {
    const code = str.charCodeAt(end - 1);

    if (code !== 0x09 && code !== 0x20) {
      break;
    }

    end -= 1;
  }

  return start === 0 && end === str.length ? str : str.slice(start, end);
}

// The control-code ranges are intentional: header sanitization strips C0/DEL bytes.
// eslint-disable-next-line no-control-regex
const INVALID_UNICODE_HEADER_VALUE_CHARS = new RegExp("[\\u0000-\\u0008\\u000a-\\u001f\\u007f]+", "g");
// eslint-disable-next-line no-control-regex, sonarjs/no-control-regex
const INVALID_BYTE_STRING_HEADER_VALUE_CHARS = new RegExp("[^\\u0009\\u0020-\\u007e\\u0080-\\u00ff]+", "g");

// eslint-disable-next-line sonarjs/function-return-type
function sanitizeValue(value: unknown, invalidChars: RegExp): string | Array<string> {
  if (utils.isArray(value)) {
    return (value as Array<unknown>).map(item => sanitizeValue(item, invalidChars) as string);
  }

  return trimSPorHTAB(String(value).replace(invalidChars, ""));
}

export const sanitizeHeaderValue = (value: unknown) =>
  sanitizeValue(value, INVALID_UNICODE_HEADER_VALUE_CHARS);

const sanitizeByteStringHeaderValue = (value: unknown) =>
  sanitizeValue(value, INVALID_BYTE_STRING_HEADER_VALUE_CHARS);

export function toByteStringHeaderObject(headers: { toJSON: () => Record<string, unknown>; }) {
  const byteStringHeaders: Record<string, unknown> = Object.create(null);

  utils.forEach(headers.toJSON(), (value: unknown, header: unknown) => {
    byteStringHeaders[String(header)] = sanitizeByteStringHeaderValue(value);
  });

  return byteStringHeaders;
}
