// A local HTTP server that records every request it receives. Close it in a finally block: a
// leaked server keeps Vitest from exiting.
import http from "node:http";
import type { AddressInfo } from "node:net";

export type RecordedRequest = { body: string; method: string; url: string; };

export type Reply = { body?: unknown; headers?: Record<string, string>; status: number; };

export type TestServer = {
  baseURL: string;
  close: () => Promise<void>;
  requests: Array<RecordedRequest>;
};

export async function startServer(reply: (request: RecordedRequest, index: number) => Reply): Promise<TestServer> {
  const requests: Array<RecordedRequest> = [];
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += String(chunk);
    const request = { method: req.method ?? "", url: req.url ?? "", body };
    requests.push(request);
    const { status, headers = {}, body: payload } = reply(request, requests.length - 1);
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(payload === undefined ? "" : JSON.stringify(payload));
  });
  const { promise, resolve } = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", resolve);
  await promise;
  const { port } = server.address() as AddressInfo;
  return {
    baseURL: `http://127.0.0.1:${port}`,
    requests,
    close: async () => {
      const closed = Promise.withResolvers<void>();
      server.close(() => closed.resolve());
      server.closeAllConnections();
      await closed.promise;
    },
  };
}

// The user every fixture fetches, as it travels on the wire.
export const USER_WIRE = {
  id: "u1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  roles: [ "admin" ],
  createdAt: "2026-01-02T03:04:05.000Z",
};

// What the response schema turns it into.
export const USER_PARSED = { ...USER_WIRE, createdAt: new Date(USER_WIRE.createdAt) };
