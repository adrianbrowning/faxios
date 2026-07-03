"use strict";

export default function combineURLs(baseURL: string, relativeURL?: string): string {
  if (!relativeURL) return baseURL;
  // Scan indices, slice once — no regex (ReDoS risk on 100k-slash inputs in browser engines)
  let i = baseURL.length - 1;
  while (i >= 0 && baseURL.charCodeAt(i) === 47) i--;
  let j = 0;
  while (j < relativeURL.length && relativeURL.charCodeAt(j) === 47) j++;
  return baseURL.slice(0, i + 1) + "/" + relativeURL.slice(j);
}
