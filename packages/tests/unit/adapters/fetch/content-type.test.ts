import assert from "node:assert";
import type { AddressInfo } from "node:net";
import NodeFormData from "form-data";
import { describe, it } from "vitest";
import faxios from "#src/index.js";
import {
  startHTTPServer,
  stopHTTPServer
} from "../../../setup/server.js";
import { fetchFaxios } from "./_helpers.js";

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    describe("fetch adapter - Content-Type handling", () => {
      it("should reject a form-data package body with ERR_NOT_SUPPORT before sending it", async () => {
        const form = new NodeFormData();
        form.append("foo", "bar");
        let requests = 0;

        const server = await startHTTPServer(
          (_req, res) => {
            requests++;
            res.end("OK");
          }
        );

        try {
          await assert.rejects(
            fetchFaxios.post(
              `http://localhost:${(server.address() as AddressInfo).port}/form`,
              form
            ),
            err => {
              const e = err as { code: string; message: string; };
              assert.ok(faxios.isFaxiosError(err));
              assert.strictEqual(e.code, "ERR_NOT_SUPPORT");
              assert.match(e.message, /use the global FormData/);
              return true;
            }
          );
          assert.strictEqual(requests, 0);
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      // The header's boundary must be the one fetch encoded the body with, or the server can't
      // split the parts.
      const echoMultipart = async () => startHTTPServer(
        async (req, res) => {
          const chunks: Array<Buffer> = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ contentType: req.headers["content-type"], body: Buffer.concat(chunks).toString() }));
        }
      );

      it.each([
        [ "no Content-Type", {}],
        [ "a multipart Content-Type without a boundary", { headers: { "Content-Type": "multipart/form-data" } }],
        [ "a caller boundary", { headers: { "Content-Type": "multipart/form-data; boundary=----CustomBoundary123" } }],
        [ "a non-multipart Content-Type", { headers: { "Content-Type": "text/plain" } }],
        [ "onUploadProgress", { onUploadProgress: () => {} }],
        [ "maxBodyLength", { maxBodyLength: 1024 * 1024 }],
      ] as const)("should send a FormData body with the boundary it was encoded with, given %s", async (_label, options) => {
        const form = new FormData();
        form.append("foo", "bar");
        const server = await echoMultipart();

        try {
          const { data } = await fetchFaxios.post<{ body: string; contentType: string; }>(
            `http://localhost:${(server.address() as AddressInfo).port}/form`,
            form,
            options
          );
          const boundary = /^multipart\/form-data; boundary=(\S+)$/i.exec(data.contentType)?.[1];
          assert.ok(boundary, `Content-Type: ${data.contentType}`);
          assert.ok(data.body.startsWith(`--${boundary}\r\n`), data.body);
          assert.ok(data.body.includes("name=\"foo\"\r\n\r\nbar\r\n"), data.body);
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    });
  }
);
