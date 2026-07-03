"use strict";

// ponytail: protocol-relative URLs (//) intentionally not supported — HTTPS-era fork
export default function isAbsoluteURL(url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    new URL(url);
    return true;
  }
  catch {
    return false;
  }
}
