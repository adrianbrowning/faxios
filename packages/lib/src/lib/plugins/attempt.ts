// Shared only by the built-in plugins; not exported from any entry point. retry writes the number
// of the try it is about to make under this key of ctx.state, and timing reads it.
export const RETRY_ATTEMPT: unique symbol = Symbol("faxios.retry.attempt");
