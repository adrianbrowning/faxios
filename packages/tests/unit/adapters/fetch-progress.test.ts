import assert from "node:assert";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { describe, it } from "vitest";
import faxios from "#src/index.js";
import type { FaxiosProgressEvent } from "#src/lib/types.js";
import { setTimeoutAsync, startHTTPServer, stopHTTPServer } from "../../setup/server.js";

const BODY = "x".repeat(200_000);

const urlOf = (server: { address: () => AddressInfo | null | string; }) =>
  `http://localhost:${(server.address() as AddressInfo).port}/`;

const collectUncaught = async (run: () => Promise<void>): Promise<Array<unknown>> => {
  const errors: Array<unknown> = [];
  const onError = (err: unknown) => {
    errors.push(err);
  };
  const previous = process.listeners("uncaughtException");
  const previousRejection = process.listeners("unhandledRejection");
  process.removeAllListeners("uncaughtException");
  process.removeAllListeners("unhandledRejection");
  process.on("uncaughtException", onError);
  process.on("unhandledRejection", onError);
  try {
    await run();
    // Let queued microtasks and timers from the progress throttle run.
    await setTimeoutAsync(50);
  }
  finally {
    process.off("uncaughtException", onError);
    process.off("unhandledRejection", onError);
    previous.forEach(l => process.on("uncaughtException", l));
    previousRejection.forEach(l => process.on("unhandledRejection", l));
  }
  return errors;
};

describe("fetch adapter progress callbacks", () => {
  for (const kind of [ "sync", "async" ] as const) {
    it(`ignores a ${kind} error thrown by onDownloadProgress`, async () => {
      const server = await startHTTPServer((_req, res) => res.end(BODY));
      try {
        let calls = 0;
        const errors = await collectUncaught(async () => {
          const { data } = await faxios.get(urlOf(server), {
            responseType: "text",
            onDownloadProgress: kind === "sync"
              ? () => {
                calls++;
                throw new Error("progress-cb-boom");
              }
              : async () => {
                calls++;
                throw new Error("progress-cb-boom");
              },
          });
          assert.strictEqual(data, BODY);
        });
        assert.ok(calls > 0);
        assert.deepStrictEqual(errors, []);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it(`ignores a ${kind} error thrown by onUploadProgress`, async () => {
      const server = await startHTTPServer((req, res) => req.pipe(res));
      try {
        let calls = 0;
        const errors = await collectUncaught(async () => {
          const { data } = await faxios.post(urlOf(server), BODY, {
            responseType: "text",
            onUploadProgress: kind === "sync"
              ? () => {
                calls++;
                throw new Error("progress-cb-boom");
              }
              : async () => {
                calls++;
                throw new Error("progress-cb-boom");
              },
          });
          assert.strictEqual(data, BODY);
        });
        assert.ok(calls > 0);
        assert.deepStrictEqual(errors, []);
      }
      finally {
        await stopHTTPServer(server);
      }
    });
  }

  it("reports an unknown total for a gzip-encoded download", async () => {
    const gz = zlib.gzipSync(BODY);
    const server = await startHTTPServer((_req, res) => {
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Content-Length", gz.length);
      res.end(gz);
    });
    try {
      const samples: Array<FaxiosProgressEvent> = [];
      const { data } = await faxios.get(urlOf(server), {
        responseType: "text",
        onDownloadProgress: e => {
          samples.push(e);
        },
      });
      await setTimeoutAsync(50);
      assert.strictEqual(data, BODY);
      assert.ok(samples.length > 0);
      for (const e of samples) {
        assert.strictEqual(e.lengthComputable, false);
        assert.strictEqual(e.total, undefined);
        assert.strictEqual(e.progress, undefined);
      }
      assert.strictEqual(samples.at(-1)?.loaded, BODY.length);
    }
    finally {
      await stopHTTPServer(server);
    }
  });
});
