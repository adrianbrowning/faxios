import assert from "node:assert";
import { describe, it, vi } from "vitest";
import { getFetch } from "#src/lib/adapters/fetch.js";

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    describe("capability probe cleanup", () => {
      it("should cancel the ReadableStream created during the request stream probe", () => {
        // The fetch adapter factory probes for request-stream support by creating
        // a ReadableStream as a Request body.  Previously the stream was never
        // cancelled, leaving a dangling pull-algorithm promise (async resource leak
        // visible via `--detect-async-leaks` or Node.js async_hooks).
        //
        // Calling getFetch with a new Request constructor triggers a fresh factory() execution
        // (including the probe).  We spy on ReadableStream.prototype.cancel to
        // verify it is invoked during the probe.

        const cancelSpy = vi.spyOn(ReadableStream.prototype, "cancel");

        try {
          // Adapters are cached per Request/Response pair, so a new Request misses the cache.
          getFetch({ env: { Request: class extends Request {} } });

          assert.ok(
            cancelSpy.mock.calls.length > 0,
            "ReadableStream.prototype.cancel should be called during the capability probe"
          );
        }
        finally {
          cancelSpy.mockRestore();
        }
      });
    });
  }
);
