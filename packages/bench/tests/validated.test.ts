import { describe, expect, it } from "vitest";
import type { GetUserInput } from "../fixtures/schemas.ts";
import { clients, outcome } from "./clients.ts";
import type { Client } from "./clients.ts";
import { startServer, USER_PARSED, USER_WIRE } from "./server.ts";
import type { Reply } from "./server.ts";

const VALID: GetUserInput = { path: { id: "u1" }, query: { fields: "summary", limit: 10 } };

// The validated stage, and the retry stage's endpoint, which must validate the same way.
const stages = clients.flatMap(client => [
  { client, stage: "validated", create: (baseURL: string) => client.createValidated({ baseURL }) },
  { client, stage: "retry", create: (baseURL: string) => client.createRetrying({ baseURL }) },
]);

async function run(client: Client, create: (baseURL: string) => { getUser: (input: GetUserInput) => Promise<unknown>; }, input: GetUserInput, reply: Reply) {
  const server = await startServer(() => reply);
  try {
    const result = await outcome(client, create(server.baseURL).getUser(input));
    return { result, requests: server.requests };
  }
  finally {
    await server.close();
  }
}

describe.each(stages)("$client.name $stage endpoint", ({ client, create }) => {
  it("sends the validated path and query and resolves with the schema's output", async () => {
    const { result, requests } = await run(client, create, VALID, { status: 200, body: USER_WIRE });
    expect(result).toEqual({ value: USER_PARSED });
    expect(requests).toEqual([ { method: "GET", url: "/users/u1?fields=summary&limit=10", body: "" } ]);
  });

  it.each([
    [ "a path id with a slash", { ...VALID, path: { id: "../admin" } } ],
    [ "an empty path id", { ...VALID, path: { id: "" } } ],
  ])("rejects %s before any request", async (_label, input) => {
    const { result, requests } = await run(client, create, input, { status: 200, body: USER_WIRE });
    expect(result).toEqual({ kind: "path-schema" });
    expect(requests).toHaveLength(0);
  });

  it.each<[string, GetUserInput]>([
    // A JavaScript caller can pass what the type rules out.
    [ "an unknown fields value", { ...VALID, query: { fields: "all" as "full", limit: 10 } } ],
    [ "a limit of 0", { ...VALID, query: { fields: "full", limit: 0 } } ],
    [ "a fractional limit", { ...VALID, query: { fields: "full", limit: 2.5 } } ],
  ])("rejects %s before any request", async (_label, input) => {
    const { result, requests } = await run(client, create, input, { status: 200, body: USER_WIRE });
    expect(result).toEqual({ kind: "query-schema" });
    expect(requests).toHaveLength(0);
  });

  it.each([
    [ "an invalid email", { ...USER_WIRE, email: "not-an-email" } ],
    [ "an unknown role", { ...USER_WIRE, roles: [ "root" ] } ],
    [ "a missing name", { ...USER_WIRE, name: undefined } ],
  ])("rejects a 200 response with %s", async (_label, body) => {
    const { result, requests } = await run(client, create, VALID, { status: 200, body });
    expect(result).toEqual({ kind: "response-schema" });
    expect(requests).toHaveLength(1);
  });

  it("rejects a non-2xx status before validating the body", async () => {
    const { result } = await run(client, create, VALID, { status: 404, body: { message: "missing" } });
    expect(result).toEqual({ kind: "status:404" });
  });
});
