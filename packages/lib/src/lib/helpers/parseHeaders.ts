"use strict";

import utils from "../utils.js";

// RawFaxiosHeaders whose duplicates are ignored by node
// c.f. https://nodejs.org/api/http.html#http_message_headers
const ignoreDuplicateOf = utils.toObjectSet([
  "age",
  "authorization",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "from",
  "host",
  "if-modified-since",
  "if-unmodified-since",
  "last-modified",
  "location",
  "max-forwards",
  "proxy-authorization",
  "referer",
  "retry-after",
  "user-agent",
], "");

/**
 * Parse headers into an object
 *
 * ```
 * Date: Wed, 27 Aug 2014 08:58:49 GMT
 * Content-Type: application/json
 * Connection: keep-alive
 * Transfer-Encoding: chunked
 * ```
 *
 * @param {String} rawHeaders Headers needing to be parsed
 *
 * @returns {Object} Headers parsed into an object
 */
export default function parseHeaders(rawHeaders: string): Record<string, string | Array<string>> {
  const parsed: Record<string, string | Array<string>> = {};
  let key: string;
  let val: string;
  let i: number;

  /* eslint-disable big-o/no-array-lookup-in-loop -- String.indexOf, not array lookup */
  rawHeaders &&
    rawHeaders.split("\n").forEach(function parser(line) {
      i = line.indexOf(":");
      key = line.substring(0, i).trim()
        .toLowerCase();
      val = line.substring(i + 1).trim();

      if (!key || (parsed[key] !== undefined && ignoreDuplicateOf[key] !== undefined)) {
        return;
      }

      if (key === "set-cookie") {
        const existing = parsed[key];
        if (existing) {
          (existing as Array<string>).push(val);
        }
        else {
          parsed[key] = [ val ];
        }
      }
      else {
        const existing = parsed[key] as string | undefined;
        parsed[key] = existing ? existing + ", " + val : val;
      }
    });
  /* eslint-enable big-o/no-array-lookup-in-loop */

  return parsed;
};
