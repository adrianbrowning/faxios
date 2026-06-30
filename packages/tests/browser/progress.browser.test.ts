import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import faxios from "#src/index.js";

// fetch emits download progress via the response body stream. Upload progress
// (onUploadProgress) is not covered: fetch cannot report request upload bytes
// in browsers, so faxios no-ops it. See MIGRATION_GUIDE.

let originalFetch: typeof globalThis.fetch;

const streamedResponse = (body: string) =>
  new Response(body, {
    status: 200,
    statusText: "OK",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(new TextEncoder().encode(body).byteLength),
    },
  });

describe("progress (vitest browser)", () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () => streamedResponse("{\"foo\":\"bar\"}")
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("should add a download progress handler", async () => {
    const progressSpy = vi.fn();

    await faxios("/foo", { onDownloadProgress: progressSpy });

    expect(progressSpy).toHaveBeenCalled();
  });

  it("should add a download progress handler from instance config", async () => {
    const progressSpy = vi.fn();
    const instance = faxios.create({ onDownloadProgress: progressSpy });

    await instance.get("/foo");

    expect(progressSpy).toHaveBeenCalled();
  });

  it("should report loaded bytes through the progress event", async () => {
    const events: Array<{ loaded: number; }> = [];

    await faxios("/foo", {
      onDownloadProgress: e => events.push({ loaded: e.loaded }),
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events.at(-1)!.loaded).toBeGreaterThan(0);
  });
});
