/* disable-eslint promise/always-return */

import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import http2 from "node:http2";
import stream from "node:stream";
import getStream from "get-stream";
import selfsigned from "selfsigned";
import { Throttle } from "stream-throttle";

const setTimeoutAsync = async (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

// Generated on first HTTP/2 use only: plain HTTP servers then start without touching the
// certificate code, which breaks while a test has polluted Object.prototype.
let certificatePromise: ReturnType<typeof selfsigned.generate> | undefined;
const getCertificate = async () =>
  (certificatePromise ??= selfsigned.generate(undefined, { keySize: 2048 }));

type ServerOptions = {
  cert?: string;
  handler?: (req: IncomingMessage, res: ServerResponse) => void;
  keepAlive?: number;
  key?: string;
  port?: number;
  rate?: number;
  useBuffering?: boolean;
  useHTTP2?: boolean;
};

export type ExtendedServer = (http2.Http2SecureServer | http.Server) & {
  closeAllConnections?: () => void;
  closeAllSessions?: () => void;
};

export const startHTTPServer = async (
  handlerOrOptions:
    | ((req: IncomingMessage, res: ServerResponse) => void)
    | ServerOptions,
  options?: ServerOptions
): Promise<ExtendedServer> => {
  const {
    handler,
    useBuffering = false,
    rate = undefined,
    // Default to 0 so the OS assigns a free ephemeral port. Tests that need
    // a deterministic port can still pass one explicitly. Sharing a fixed
    // port across many tests creates TIME_WAIT / pool-reuse races that
    // surface as EPIPE on the client under CI runner load.
    port = 0,
    keepAlive = 1000,
    useHTTP2,
    key,
    cert,
  } = Object.assign(
    typeof handlerOrOptions === "function"
      ? { handler: handlerOrOptions }
      : handlerOrOptions ?? {},
    options
  );

  const certificate = useHTTP2 && (!key || !cert) ? await getCertificate() : undefined;

  return new Promise((resolve, reject) => {
    const serverHandler =
      handler ||
      async function (req: IncomingMessage, res: ServerResponse) {
        try {
          req.headers["content-length"] &&
            res.setHeader("content-length", req.headers["content-length"]);

          let dataStream: stream.Readable = req;

          if (useBuffering) {
            dataStream = stream.Readable.from(await getStream(req));
          }

          const streams: Array<
            | NodeJS.ReadableStream
            | NodeJS.ReadWriteStream
            | NodeJS.WritableStream
          > = [ dataStream ];

          if (rate) {
            streams.push(new Throttle({ rate }));
          }

          streams.push(res);

          stream.pipeline(streams, (err: NodeJS.ErrnoException | null) => {
            err && console.log("Server warning: " + err.message);
          });
        }
        catch (err) {
          console.warn("HTTP server error:", err);
        }
      };

    const server = useHTTP2
      ? http2.createSecureServer(
        { key: key ?? certificate?.private, cert: cert ?? certificate?.cert },
        serverHandler as unknown as (
          req: http2.Http2ServerRequest,
          res: http2.Http2ServerResponse
        ) => void
      )
      : http.createServer(serverHandler);

    const sessions = new Set<http2.ServerHttp2Session>();

    if (useHTTP2) {
      (server as http2.Http2SecureServer).on(
        "session",
        (session: http2.ServerHttp2Session) => {
          sessions.add(session);

          session.once("close", () => {
            sessions.delete(session);
          });
        }
      );

      (server as ExtendedServer).closeAllSessions = () => {
        for (const session of sessions) {
          session.destroy();
        }
      };
    }
    else {
      (server as http.Server).keepAliveTimeout = keepAlive;
    }

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
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    if (typeof server.closeAllSessions === "function") {
      server.closeAllSessions();
    }
    const outcome = await Promise.race([
      closed.then(() => "closed"),
      setTimeoutAsync(timeout - grace).then(() => "timed_out"),
    ]);

    if (outcome === "timed_out") {
      throw new Error(`Test server did not close within ${timeout}ms`);
    }
  }
};

export const generateReadable = (
  length = 1024 * 1024,
  chunkSize = 10 * 1024,
  sleep = 50
) =>
  stream.Readable.from(
    (async function* () {
      let dataLength = 0;

      while (dataLength < length) {
        const leftBytes = length - dataLength;

        const chunk = Buffer.alloc(
          leftBytes > chunkSize ? chunkSize : leftBytes
        );

        dataLength += chunk.length;

        yield chunk;

        if (sleep) {
          await setTimeoutAsync(sleep);
        }
      }
    })()
  );

export const makeReadableStream = (chunk = "chunk", n = 10, timeout = 100) =>
  new ReadableStream(
    {
      async pull(controller) {
        await setTimeoutAsync(timeout);
        n-- ? controller.enqueue(chunk) : controller.close();
      },
    },
    {
      highWaterMark: 1,
    }
  );

export const makeEchoStream = (echo: boolean) =>
  new WritableStream({
    write(chunk) {
      echo && console.log("Echo chunk", chunk);
    },
  });
