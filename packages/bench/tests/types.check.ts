// Type-checked, never run (`pnpm --filter @faxios/tests test:bench` runs the workspace's tsc on
// packages/bench): every validated fixture returns the response schema's output type, not its
// input or `unknown`.
import type { User } from "../fixtures/schemas.ts";
import type { clients } from "./clients.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

type Client = (typeof clients)[number];
type ValidatedUser<C extends Client> = Awaited<ReturnType<ReturnType<C["createValidated"]>["getUser"]>>;
type RetryingUser<C extends Client> = Awaited<ReturnType<ReturnType<C["createRetrying"]>["getUser"]>>;

export type Checks = [
  Expect<Equal<ValidatedUser<(typeof clients)[0]>, User>>,
  Expect<Equal<ValidatedUser<(typeof clients)[1]>, User>>,
  Expect<Equal<ValidatedUser<(typeof clients)[2]>, User>>,
  Expect<Equal<RetryingUser<(typeof clients)[0]>, User>>,
  Expect<Equal<RetryingUser<(typeof clients)[1]>, User>>,
  Expect<Equal<RetryingUser<(typeof clients)[2]>, User>>,
  // The schema's output: createdAt is a Date after parsing, a string on the wire.
  Expect<Equal<User["createdAt"], Date>>,
];
