declare module "abortcontroller-polyfill/dist/cjs-ponyfill.js" {
  export const AbortController: typeof globalThis.AbortController;
  export const AbortSignal: typeof globalThis.AbortSignal;
}
