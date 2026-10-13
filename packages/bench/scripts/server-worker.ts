// The local HTTP server for the runtime benchmark. It runs in a worker thread, so serving
// requests doesn't share an event loop with the clients being measured. It counts every request
// in a shared counter the benchmark reads to check attempts per operation.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { parentPort, workerData } from "node:worker_threads";
import { createResponder, USER_BODY } from "./workload.ts";

const counter = new Int32Array(workerData as SharedArrayBuffer);
const respond = createResponder();

const server = http.createServer((req, res) => {
  Atomics.add(counter, 0, 1);
  const status = respond(new URL(req.url ?? "/", "http://localhost").pathname);
  const body = status === 200 ? USER_BODY : "{\"message\":\"unavailable\"}";
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
});

server.keepAliveTimeout = 60_000;
server.listen(0, "127.0.0.1", () => {
  parentPort?.postMessage((server.address() as AddressInfo).port);
});

parentPort?.on("message", message => {
  if (message === "close") {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  }
});
