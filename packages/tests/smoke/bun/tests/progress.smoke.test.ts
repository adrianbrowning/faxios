import { describe, expect, test } from "bun:test";
import faxios from "faxios";
import type { MockFetch } from "./helpers.ts";

describe("progress", () => {
  test("onDownloadProgress fires with loaded > 0 for streaming fetch response", async () => {
    const samples: Array<number> = [];

    const fetch: MockFetch = async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("ab"));
          controller.enqueue(new TextEncoder().encode("cd"));
          controller.close();
        },
      });

      return new Response(stream, { status: 200, headers: { "Content-Type": "text/plain", "Content-Length": "4" } });
    };

    const response = await faxios.get("https://example.com/download", {
      responseType: "text",
      onDownloadProgress: ({ loaded }) => {
        samples.push(loaded);
      },
      env: { fetch },
    });

    expect(response.data).toBe("abcd");
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.at(-1)).toBe(4);
  });
});
