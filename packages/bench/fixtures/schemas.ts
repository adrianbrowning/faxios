// The schemas every validated fixture uses, so the three clients validate exactly the same thing.
// A namespace import, as zod recommends: a bundler keeps only the parts the schemas use.
import * as z from "zod";

// A user id: one path segment, so "../admin" or "a/b" can never change the route.
export const userPathSchema = z.object({
  id: z.string().regex(/^[\w-]{1,64}$/),
});

export const userQuerySchema = z.object({
  fields: z.enum([ "summary", "full" ]),
  limit: z.number().int()
    .min(1)
    .max(100),
});

export const userSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  email: z.email(),
  roles: z.array(z.enum([ "admin", "member" ])),
  // The output type differs from the wire type, so a fixture that returns the unparsed body fails.
  createdAt: z.iso.datetime().transform(value => new Date(value)),
});

export type UserPath = z.input<typeof userPathSchema>;
export type UserQuery = z.input<typeof userQuerySchema>;
export type User = z.output<typeof userSchema>;

// The request every validated fixture sends.
export type GetUserInput = {
  path: UserPath;
  query: UserQuery;
  signal?: AbortSignal;
};
