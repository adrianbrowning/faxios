import { Readable } from "node:stream";
import faxios from "faxios";
import { describe, expect, it } from "vitest";

describe("files compat (dist export only)", () => {
  it("supports posting Buffer payloads", async () => {
    const source = Buffer.from("binary-\x00-data", "utf8");
    let capturedBody;

    const mockFetch = async input => {
      capturedBody = Buffer.from(await input.arrayBuffer());
      return new Response(JSON.stringify({ echoed: capturedBody.toString("base64") }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const response = await faxios.post("http://example.com/upload", source, {
      env: { fetch: mockFetch, Request, Response },
    });

    expect(response.data.echoed).toBe(source.toString("base64"));
  });

  it("supports posting Uint8Array payloads", async () => {
    const source = Uint8Array.from([ 1, 2, 3, 4, 255 ]);
    let capturedBody;

    const mockFetch = async input => {
      capturedBody = new Uint8Array(await input.arrayBuffer());
      return new Response(JSON.stringify({ echoed: Array.from(capturedBody.values()) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const response = await faxios.post("http://example.com/upload", source, {
      env: { fetch: mockFetch, Request, Response },
    });

    expect(response.data.echoed).toEqual([ 1, 2, 3, 4, 255 ]);
  });

  it("supports posting Readable stream payloads", async () => {
    const streamData = [ "hello ", "stream ", "world" ];
    const source = Readable.from(streamData);

    const mockFetch = async input => {
      const text = new TextDecoder().decode(await input.arrayBuffer());
      const contentType = input.headers.get("content-type") ?? "";
      return new Response(JSON.stringify({ text, contentType }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const response = await faxios.post("http://example.com/upload", source, {
      headers: { "Content-Type": "application/octet-stream" },
      env: { fetch: mockFetch, Request, Response },
    });

    expect(response.data.text).toBe("hello stream world");
    expect(response.data.contentType).toContain("application/octet-stream");
  });

  it("supports binary downloads with responseType=arraybuffer", async () => {
    const bytes = [ 0xde, 0xad, 0xbe, 0xef ];
    const binary = new Uint8Array(bytes);

    const mockFetch = async () =>
      new Response(binary, {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      });

    const response = await faxios.get("http://example.com/file.bin", {
      responseType: "arraybuffer",
      env: { fetch: mockFetch, Request, Response },
    });

    expect(response.data).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(response.data))).toEqual(bytes);
  });
});
