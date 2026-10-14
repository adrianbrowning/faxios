// @ts-self-types="./all.d.ts"
/** `Promise.all`, kept for axios compatibility: a tuple of promises (or plain values) resolves to a tuple of their results. */
export async function all<T extends [] | ReadonlyArray<unknown>>(values: T): Promise<{ -readonly [K in keyof T]: Awaited<T[K]>; }> {
  return Promise.all(values);
}
