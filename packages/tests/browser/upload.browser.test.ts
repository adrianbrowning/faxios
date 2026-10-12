import { describe, expect, it, vi } from "vitest";

import faxios from "#src/index.js";

// Real uploads to the same-origin HTTP/1.1 endpoint that vitest.config.js adds to the Vitest
// server. Chromium sends a stream request body only over HTTP/2+ and WebKit not at all, so faxios
// never wraps a body in a stream for upload progress in browsers (#170, #209).
const UPLOAD_URL = "/__faxios/upload";
const BODY_SIZE = 200_000;

type UploadResult = { contentType: null | string; received: number; };

describe("uploads to a real HTTP/1.1 server (vitest browser)", () => {
  it("sends a body when onUploadProgress is set, without calling it", async () => {
    const onUploadProgress = vi.fn();

    const response = await faxios.post<UploadResult>(UPLOAD_URL, new Uint8Array(BODY_SIZE), {
      headers: { "Content-Type": "application/octet-stream" },
      onUploadProgress,
    });

    expect(response.status).toBe(200);
    expect(response.data.received).toBe(BODY_SIZE);
    expect(onUploadProgress).not.toHaveBeenCalled();
  });

  it("sends a FormData body with onUploadProgress and maxBodyLength without buffering it first", async () => {
    const arrayBuffer = vi.spyOn(Request.prototype, "arrayBuffer");
    try {
      const form = new FormData();
      form.append("file", new Blob([ new Uint8Array(BODY_SIZE) ]), "file.bin");

      const response = await faxios.post<UploadResult>(UPLOAD_URL, form, {
        maxBodyLength: 2 * BODY_SIZE,
        onUploadProgress() {},
      });

      expect(response.data.received).toBeGreaterThan(BODY_SIZE);
      expect(response.data.contentType).toMatch(/^multipart\/form-data; boundary=/);
      expect(arrayBuffer).not.toHaveBeenCalled();
    }
    finally {
      arrayBuffer.mockRestore();
    }
  });

  it("rejects a FormData body whose fields alone exceed maxBodyLength, without buffering it", async () => {
    const arrayBuffer = vi.spyOn(Request.prototype, "arrayBuffer");
    try {
      const form = new FormData();
      form.append("file", new Blob([ new Uint8Array(BODY_SIZE) ]), "file.bin");

      await expect(faxios.post(UPLOAD_URL, form, { maxBodyLength: BODY_SIZE - 1 })).rejects.toMatchObject({
        code: "ERR_BAD_REQUEST",
        message: "Request body larger than maxBodyLength limit",
      });
      expect(arrayBuffer).not.toHaveBeenCalled();
    }
    finally {
      arrayBuffer.mockRestore();
    }
  });
});
