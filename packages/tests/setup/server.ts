import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import stream from "node:stream";

const setTimeoutAsync = async (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

type ServerOptions = {
  handler?: Handler;
  // Default 0: the OS assigns a free port. A fixed port shared across tests or worktrees
  // collides with whatever else holds it.
  port?: number;
};

export type ExtendedServer = http.Server;

// Echoes the request body back, with the same Content-Length.
const echoHandler: Handler = (req, res) => {
  if (req.headers["content-length"]) res.setHeader("content-length", req.headers["content-length"]);
  stream.pipeline(req, res, err => {
    if (err) console.log("Server warning: " + err.message);
  });
};

export const startHTTPServer = async (
  handlerOrOptions: Handler | ServerOptions,
  options?: ServerOptions
): Promise<ExtendedServer> => {
  const { handler = echoHandler, port = 0 } = Object.assign(
    typeof handlerOrOptions === "function" ? { handler: handlerOrOptions } : handlerOrOptions,
    options
  );

  const server = http.createServer(handler);
  server.keepAliveTimeout = 1000;

  return new Promise((resolve, reject) => {
    // A bind failure (EADDRINUSE) rejects the test that started the server instead of
    // surfacing as an unhandled error while the test hangs.
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server);
    });
  });
};

export const stopHTTPServer = async (
  server: ExtendedServer,
  timeout = 10000
) => {
  if (!server) return;

  // Try a graceful close first so in-flight requests can finish writing and
  // clients see clean FINs instead of RSTs. Forcefully tearing down sockets
  // up-front (closeAllConnections) is what produces dangling RSTs that the
  // next test on the same port can observe as EPIPE on its client write.
  // Force-close only after a short grace period.
  const closed = new Promise(resolve => server.close(resolve));
  const grace = Math.min(2000, Math.max(0, timeout / 2));

  const winner = await Promise.race([
    closed.then(() => "graceful"),
    setTimeoutAsync(grace).then(() => "grace_elapsed"),
  ]);

  if (winner === "grace_elapsed") {
    server.closeAllConnections();
    const outcome = await Promise.race([
      closed.then(() => "closed"),
      setTimeoutAsync(timeout - grace).then(() => "timed_out"),
    ]);

    if (outcome === "timed_out") {
      throw new Error(`Test server did not close within ${timeout}ms`);
    }
  }
};
