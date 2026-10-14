import assert from "node:assert";
import type { AddressInfo } from "node:net";
import stream from "node:stream";
import { describe, it } from "vitest";
import faxios from "#src/index.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import {
  startHTTPServer,
  stopHTTPServer
} from "../../../setup/server.js";
import { fetchFaxios } from "./_helpers.js";

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    it("should support stream.Readable as a payload", async () => {
      const server = await startHTTPServer(async (_req, res) => res.end("OK"));

      try {
        const { data } = await fetchFaxios.post(
          `http://localhost:${(server.address() as AddressInfo).port}/`,
          stream.Readable.from("OK")
        );

        assert.strictEqual(data, "OK");
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    for (const [ kind, makeBody ] of [
      [ "stream.Readable", () => stream.Readable.from([ "hello world" ]) ],
      [ "ReadableStream", () => new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("hello world"));
          controller.close();
        },
      }) ],
    ] as const) {
      it(`rejects with a coded error when middleware sends a used ${kind} body again`, async () => {
        const server = await startHTTPServer((req, res) => {
          req.resume();
          req.on("end", () => {
            res.statusCode = 503;
            res.end();
          });
        });

        try {
          const api = faxios.create({ allowAbsoluteUrls: true }).use(async (ctx, next) => {
            try {
              return await next(ctx);
            }
            catch {
              return next(ctx);
            }
          });

          const err = await api.post(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            makeBody()
          ).catch((e: unknown) => e);

          assert.ok(err instanceof FaxiosError, `expected a FaxiosError, got ${String(err)}`);
          assert.strictEqual(err.code, FaxiosError.ERR_BAD_REQUEST);
          assert.match(err.message, /body stream was already used/);
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    }

    it("sends an unread ReadableStream body again after a try that failed before sending", async () => {
      const server = await startHTTPServer(async (req, res) => {
        const chunks: Array<Buffer> = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        res.end(Buffer.concat(chunks).toString());
      });

      try {
        const url = `http://localhost:${(server.address() as AddressInfo).port}/`;
        // The first try's data: URL fails the maxContentLength pre-flight check, before fetch.
        const api = faxios.create({ allowAbsoluteUrls: true }).use(async (ctx, next) => {
          const dataURL = `data:text/plain,${"0".repeat(64)}`;
          await assert.rejects(next({ ...ctx, config: { ...ctx.config, url: dataURL } }), { code: "ERR_BAD_RESPONSE" });
          return next(ctx);
        });
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("hello world"));
            controller.close();
          },
        });

        const { data } = await api.post(url, body, { maxContentLength: 32 });

        assert.strictEqual(data, "hello world");
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    describe("fetch adapter - request body bytes", () => {
      const echoBody = async () => startHTTPServer(
        async (req, res) => {
          const chunks: Array<Buffer> = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ body: Buffer.concat(chunks).toString() }));
        }
      );
      const backing = new TextEncoder().encode("HEADERpayloadTRAILER");

      it.each([
        [ "an offset subarray", backing.subarray(6, 13) ],
        [ "a DataView", new DataView(backing.buffer, 6, 7) ],
      ])("should send only the bytes of %s, not its whole buffer", async (_label, view) => {
        const server = await echoBody();

        try {
          const { data } = await fetchFaxios.post<{ body: string; }>(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            view
          );

          assert.strictEqual(data.body, "payload");
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should send every chunk of a Node stream body", async () => {
        const server = await echoBody();
        const chunks = [ "ab0", "ab1", "ab2" ];

        try {
          const { data } = await fetchFaxios.post<{ body: string; }>(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            stream.Readable.from(chunks),
            { headers: { "Content-Length": 9 } }
          );

          assert.strictEqual(data.body, "ab0ab1ab2");
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    });
  }
);
