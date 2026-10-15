import assert from "node:assert";
import { describe, it } from "vitest";
import { getFetch } from "#src/lib/adapters/fetch.js";

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    describe("capability probe cleanup", () => {
      it("should cancel the ReadableStream created during the request stream probe", async () => {
        // The request-stream probe builds a Request with a ReadableStream body. A probe that
        // left that stream open would leave a pending pull behind (an async resource leak).
        const probeBodies: Array<ReadableStream> = [];
        class ProbeRequest extends Request {
          constructor(...args: ConstructorParameters<typeof Request>) {
            super(...args);
            if (args[1]?.body instanceof ReadableStream && this.body) probeBodies.push(this.body);
          }
        }

        // Adapters are cached per Request/Response pair, so a new Request misses the cache.
        getFetch({ env: { Request: ProbeRequest } });

        assert.ok(probeBodies.length > 0, "the probe must build a Request with a stream body");
        for (const body of probeBodies) {
          // A cancelled stream is closed: its first read resolves at once with `done`. An open
          // one has no data and would stay pending, losing the race to the resolved sentinel.
          const first = await Promise.race([ body.getReader().read(), Promise.resolve("pending" as const) ]);
          assert.deepStrictEqual(first, { done: true, value: undefined }, "the probe stream must be cancelled");
        }
      });
    });
  }
);
