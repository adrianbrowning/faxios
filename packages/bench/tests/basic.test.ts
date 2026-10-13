import { describe, expect, it } from "vitest";
import { createBasic as axiosBasic } from "../fixtures/axios/basic.ts";
import { clients, outcome } from "./clients.ts";
import { startServer, USER_WIRE } from "./server.ts";

describe.each(clients)("$name basic request", client => {
  it("sends one GET and resolves with the parsed JSON body", async () => {
    const server = await startServer(() => ({ status: 200, body: USER_WIRE }));
    try {
      const api = client.createBasic({ baseURL: server.baseURL });
      await expect(api.getUser("u1")).resolves.toEqual(USER_WIRE);
      expect(server.requests).toEqual([ { method: "GET", url: "/users/u1", body: "" } ]);
    }
    finally {
      await server.close();
    }
  });

  it.each([ 404, 500 ])("rejects a %i response", async status => {
    const server = await startServer(() => ({ status, body: { message: "nope" } }));
    try {
      const api = client.createBasic({ baseURL: server.baseURL });
      await expect(outcome(client, api.getUser("u1"))).resolves.toEqual({ kind: `status:${status}` });
      expect(server.requests).toHaveLength(1);
    }
    finally {
      await server.close();
    }
  });
});

// The secondary measurement: Axios on its default Node adapter instead of fetch.
describe("axios basic request on its default adapter", () => {
  const client = clients.find(c => c.name === "axios")!;

  it("resolves the body and rejects a non-2xx status", async () => {
    const server = await startServer((_request, index) => (index === 0 ? { status: 200, body: USER_WIRE } : { status: 404 }));
    try {
      const api = axiosBasic({ baseURL: server.baseURL, adapter: "http" });
      await expect(api.getUser("u1")).resolves.toEqual(USER_WIRE);
      await expect(outcome(client, api.getUser("u1"))).resolves.toEqual({ kind: "status:404" });
    }
    finally {
      await server.close();
    }
  });
});
