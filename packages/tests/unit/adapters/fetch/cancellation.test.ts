import assert from "node:assert";
import { AbortController } from "abortcontroller-polyfill/dist/cjs-ponyfill.js";
import { describe, it } from "vitest";
import type { GenericAbortSignal } from "#src/lib/types.js";
import { fetchFaxios } from "./_helpers.js";

const getSignal = (input: RequestInfo | URL, init?: RequestInit) =>
  (init?.signal ?? (input as Request).signal);

const abortError = () => new DOMException("This operation was aborted", "AbortError");

// A body stream with one chunk queued and room for the test to stop it; it never ends by itself.
const createOpenStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("chunk"));
    },
  });

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    describe("request aborting", () => {
      it("should be able to abort the request stream", async () => {
        const controller = new AbortController();

        // Reads the request body like fetch does, and rejects like fetch once the signal aborts.
        const uploadingFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
          const signal = getSignal(input, init);
          const body = (init?.body ?? (input as Request).body) as ReadableStream<Uint8Array>;
          const aborted = new Promise<never>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(abortError()), { once: true });
          });
          const reader = body.getReader();
          await reader.read();
          // The first request chunk reached fetch: abort mid-upload.
          controller.abort();
          return aborted;
        };

        await assert.rejects(async () => {
          await fetchFaxios.post("/", createOpenStream(), {
            responseType: "stream",
            signal: controller.signal as GenericAbortSignal,
            env: { fetch: uploadingFetch },
          });
        }, /CanceledError/);
      });

      it("should be able to abort the response stream", async () => {
        const controller = new AbortController();

        // Answers with an open body that errors like fetch's does once the signal aborts.
        const downloadingFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
          const signal = getSignal(input, init);
          const source = createOpenStream();
          const body = source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
            start(stream) {
              signal.addEventListener("abort", () => stream.error(abortError()), { once: true });
            },
          }));
          return new Response(body);
        };

        const { data } = await fetchFaxios.get("/", {
          responseType: "stream",
          signal: controller.signal as GenericAbortSignal,
          env: { fetch: downloadingFetch },
        });

        await assert.rejects(async () => {
          await (data as ReadableStream).pipeTo(new WritableStream({
            write() {
              // The first response chunk reached the caller: abort mid-download.
              controller.abort(new Error("test"));
            },
          }));
        }, /^(AbortError|CanceledError):/);
      });
    });
  }
);
