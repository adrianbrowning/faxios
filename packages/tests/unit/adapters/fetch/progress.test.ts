import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it, vi } from "vitest";
import type { FaxiosProgressEvent } from "#src/lib/types.js";
import {
  startHTTPServer,
  stopHTTPServer
} from "../../../setup/server.js";
import { fetchFaxios } from "./_helpers.js";

const CHUNK = "test";
const COUNT = 10;
const CHUNK_LENGTH = Buffer.byteLength(CHUNK);
const CONTENT_LENGTH = COUNT * CHUNK_LENGTH;
// Longer than the progress throttle window (1000 ms / 3), so each chunk gets its own event.
const CHUNK_INTERVAL = 400;
// Fake only the clock the throttle reads; setImmediate stays real so streams and asap callbacks run.
const FAKED_TIMERS: Array<"clearTimeout" | "Date" | "setTimeout"> = [ "Date", "setTimeout", "clearTimeout" ];

const drainMacrotasks = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });
  }
};

// A request or response body the test feeds one chunk at a time.
const createSource = () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return { body, controller };
};

const feed = async ({ controller }: ReturnType<typeof createSource>) => {
  for (let i = 0; i < COUNT; i++) {
    controller.enqueue(new TextEncoder().encode(CHUNK));
    await drainMacrotasks();
    await vi.advanceTimersByTimeAsync(CHUNK_INTERVAL);
  }
  controller.close();
};

// Every chunk after the first arrives CHUNK_INTERVAL ms after the one before it, so the measured
// rate is CHUNK_LENGTH bytes per CHUNK_INTERVAL ms. The first chunk falls in the speedometer's
// 250 ms warm-up, so it has no rate and no estimate.
const STEADY_RATE = (CHUNK_LENGTH * 1000) / CHUNK_INTERVAL;

const expectedSamples = (direction: { download: true; } | { upload: true; }) =>
  Array.from({ length: COUNT }, (_, i) => {
    const loaded = CHUNK_LENGTH * (i + 1);
    return {
      loaded,
      total: CONTENT_LENGTH,
      progress: loaded / CONTENT_LENGTH,
      bytes: CHUNK_LENGTH,
      rate: i === 0 ? undefined : STEADY_RATE,
      estimated: i === 0 ? undefined : (CONTENT_LENGTH - loaded) / STEADY_RATE,
      ...direction,
    };
  });

const pick = ({ loaded, total, progress, bytes, rate, estimated, upload, download }: FaxiosProgressEvent) =>
  ({ loaded, total, progress, bytes, rate, estimated, ...(upload ? { upload } : {}), ...(download ? { download } : {}) });

// Runs a GET whose response body is fed chunk by chunk, and returns the download progress samples.
const captureDownload = async (headers: Record<string, string>) => {
  vi.useFakeTimers({ toFake: FAKED_TIMERS });
  const source = createSource();
  const samples: Array<Partial<FaxiosProgressEvent>> = [];

  const request = fetchFaxios.get("/", {
    env: {
      fetch: async () => new Response(source.body, { headers }),
    },
    onDownloadProgress: event => {
      samples.push(pick(event));
    },
    responseType: "text",
  });

  await feed(source);
  const { data } = await request;
  await drainMacrotasks();
  assert.strictEqual(data, CHUNK.repeat(COUNT));
  return samples;
};

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    describe("progress", () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      describe("upload", () => {
        it("should support upload progress capturing", async () => {
          vi.useFakeTimers({ toFake: FAKED_TIMERS });
          const source = createSource();
          const samples: Array<Partial<FaxiosProgressEvent>> = [];

          const request = fetchFaxios.post("/", source.body, {
            env: {
              fetch: async (input, init) => {
                const body = (init?.body ?? (input as Request).body) as ReadableStream<Uint8Array>;
                return new Response(await new Response(body).text());
              },
            },
            onUploadProgress: event => {
              samples.push(pick(event));
            },
            headers: {
              "Content-Length": CONTENT_LENGTH,
            },
            responseType: "text",
          });

          await feed(source);
          const { data } = await request;
          await drainMacrotasks();

          assert.strictEqual(data, CHUNK.repeat(COUNT));
          assert.deepStrictEqual(samples, expectedSamples({ upload: true }));
        });

        it("should not fail with get method", async () => {
          const server = await startHTTPServer((_req, res) => res.end("OK"));

          try {
            const { data } = await fetchFaxios.get(
              `http://localhost:${(server.address() as AddressInfo).port}/`,
              {
                onUploadProgress() {},
              }
            );

            assert.strictEqual(data, "OK");
          }
          finally {
            await stopHTTPServer(server);
          }
        });

        it("should report FormData upload progress without buffering the body first", async () => {
          const server = await startHTTPServer(
            (req, res) => {
              let received = 0;
              req.on("data", chunk => {
                received += chunk.length;
              });
              req.on("end", () => {
                res.end(String(received));
              });
            }
          );
          const arrayBuffer = vi.spyOn(Request.prototype, "arrayBuffer");

          try {
            const form = new FormData();
            form.append("file", new Blob([ new Uint8Array(200_000) ]), "file.bin");
            const samples: Array<FaxiosProgressEvent> = [];

            const { data } = await fetchFaxios.post(`http://localhost:${(server.address() as AddressInfo).port}/`, form, {
              onUploadProgress: event => samples.push(event),
              responseType: "text",
            });

            assert.strictEqual(arrayBuffer.mock.calls.length, 0);
            assert.ok(samples.length > 0, "onUploadProgress was not called");
            assert.strictEqual(samples.at(-1)!.loaded, Number(data));
            for (const sample of samples) {
              assert.strictEqual(sample.lengthComputable, false);
              assert.strictEqual(sample.total, undefined);
            }
          }
          finally {
            arrayBuffer.mockRestore();
            await stopHTTPServer(server);
          }
        });
      });

      describe("download", () => {
        it("should support download progress capturing", async () => {
          const samples = await captureDownload({ "Content-Length": String(CONTENT_LENGTH) });

          assert.deepStrictEqual(samples, expectedSamples({ download: true }));
        });

        it("reports no progress, rate or estimate for a declared total of 0", async () => {
          // A server that sends more than its Content-Length of 0: loaded is clamped to the total,
          // so no ratio is divided by zero and every event reads as no progress.
          const samples = await captureDownload({ "Content-Length": "0" });

          assert.deepStrictEqual(
            samples,
            Array.from({ length: COUNT }, () => ({
              loaded: 0,
              total: 0,
              progress: undefined,
              bytes: 0,
              rate: undefined,
              estimated: undefined,
              download: true,
            }))
          );
        });

        it("reports a rate but no estimate when the Content-Length is unknown", async () => {
          const samples = await captureDownload({});

          assert.deepStrictEqual(
            samples,
            Array.from({ length: COUNT }, (_, i) => ({
              loaded: CHUNK_LENGTH * (i + 1),
              total: undefined,
              progress: undefined,
              bytes: CHUNK_LENGTH,
              rate: i === 0 ? undefined : STEADY_RATE,
              estimated: undefined,
              download: true,
            }))
          );
        });
      });
    });
  }
);
