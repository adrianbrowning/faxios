import { Readable } from "node:stream";
import faxios from "faxios";
import { describe, expect, it } from "vitest";

describe("progress compat (dist export only)", () => {
  it("emits upload progress events for stream payloads", async () => {
    const samples = [];
    const payload = [ "abc", "def", "ghi" ];
    const total = payload.join("").length;

    // The adapter wraps the body in a tracked ReadableStream; consuming it triggers onUploadProgress.
    const mockFetch = async input => {
      // Drain the body so the tracked stream fires progress events
      await input.arrayBuffer();
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await faxios.post("http://example.com/upload", Readable.from(payload), {
      headers: { "Content-Length": String(total) },
      onUploadProgress: ({ loaded, total: reportedTotal, upload }) => {
        samples.push({ loaded, total: reportedTotal, upload });
      },
      env: { fetch: mockFetch, Request, Response },
    });

    expect(samples.length).toBeGreaterThan(0);
    expect(samples[samples.length - 1]).toMatchObject({
      loaded: total,
      total,
      upload: true,
    });
  });

  it("emits download progress events", async () => {
    const samples = [];
    const chunks = [ "ab", "cd", "ef" ];
    const total = chunks.join("").length;

    const mockFetch = async () => {
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        start(ctrl) {
          chunks.forEach(c => ctrl.enqueue(enc.encode(c)));
          ctrl.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Content-Length": String(total),
        },
      });
    };

    const response = await faxios.get("http://example.com/download", {
      responseType: "text",
      onDownloadProgress: ({ loaded, total: reportedTotal, download }) => {
        samples.push({ loaded, total: reportedTotal, download });
      },
      env: { fetch: mockFetch, Request, Response },
    });

    expect(response.data).toBe("abcdef");
    expect(samples.length).toBeGreaterThan(0);
    expect(samples[samples.length - 1]).toMatchObject({
      loaded: total,
      total,
      download: true,
    });
  });
});
