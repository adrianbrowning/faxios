import assert from "node:assert";
import type { AddressInfo } from "node:net";
import stream from "node:stream";
import util from "node:util";
import { AbortController } from "abortcontroller-polyfill/dist/cjs-ponyfill.js";
import { describe, it } from "vitest";
import type { GenericAbortSignal } from "#src/lib/types.js";
import {
  generateReadable,
  makeEchoStream,
  makeReadableStream,
  startHTTPServer,
  stopHTTPServer
} from "../../../setup/server.js";
import { fetchFaxios } from "./_helpers.js";

const pipelineAsync = util.promisify(stream.pipeline);

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    describe("request aborting", () => {
      it("should be able to abort the request stream", async () => {
        const server = await startHTTPServer(
          {
            rate: 100000,
            useBuffering: true,
          }
        );

        try {
          const controller = new AbortController();

          setTimeout(() => {
            controller.abort();
          }, 500);

          await assert.rejects(async () => {
            await fetchFaxios.post(
              `http://localhost:${(server.address() as AddressInfo).port}/`,
              makeReadableStream(),
              {
                responseType: "stream",
                signal: controller.signal as GenericAbortSignal,
              }
            );
          }, /CanceledError/);
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should be able to abort the response stream", async () => {
        const server = await startHTTPServer(
          (_req, res) => {
            pipelineAsync(generateReadable(10000, 10), res).catch(() => {
              // Client-side abort intentionally closes the stream early in this test.
            });
          }
        );

        try {
          const controller = new AbortController();

          setTimeout(() => {
            controller.abort(new Error("test"));
          }, 800);

          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              responseType: "stream",
              signal: controller.signal as GenericAbortSignal,
            }
          );

          await assert.rejects(async () => {
            await (data as ReadableStream).pipeTo(makeEchoStream(false));
          }, /^(AbortError|CanceledError):/);
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    });
  }
);
