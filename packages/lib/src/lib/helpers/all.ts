// @ts-self-types="./all.d.ts"
/** `Promise.all`, kept for axios compatibility. */
export async function all(promises: Array<Promise<unknown>>): Promise<Array<unknown>> {
  return Promise.all(promises);
}
