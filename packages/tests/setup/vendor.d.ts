declare module "abortcontroller-polyfill/dist/cjs-ponyfill.js" {
  export const AbortController: typeof globalThis.AbortController;
  export const AbortSignal: typeof globalThis.AbortSignal;
}

declare module "stream-throttle" {
  import { Transform } from "node:stream";
  class Throttle extends Transform {
    constructor(options: { rate: number; });
  }
  export { Throttle };
}
