import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { describe, it } from "vitest";
import {
  startHTTPServer,
  stopHTTPServer
} from "../../../setup/server.js";
import { fetchFaxios } from "./_helpers.js";

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    describe("responses", () => {
      it("should support text response type", async () => {
        const originalData = "my data";

        const server = await startHTTPServer(
          (_req, res) => res.end(originalData)
        );

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              responseType: "text",
            }
          );

          assert.deepStrictEqual(data, originalData);
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should support arraybuffer response type", async () => {
        const originalData = "my data";

        const server = await startHTTPServer(
          (_req, res) => res.end(originalData)
        );

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              responseType: "arraybuffer",
            }
          );

          assert.deepStrictEqual(
            data,
            Uint8Array.from(new TextEncoder().encode(originalData)).buffer
          );
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should support blob response type", async () => {
        const originalData = "my data";

        const server = await startHTTPServer(
          (_req, res) => res.end(originalData)
        );

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              responseType: "blob",
            }
          );

          assert.deepStrictEqual(data, new Blob([ originalData ]));
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should support stream response type", async () => {
        const originalData = "my data";

        const server = await startHTTPServer(
          (_req, res) => res.end(originalData)
        );

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              responseType: "stream",
            }
          );

          assert.ok(
            data instanceof ReadableStream,
            "data is not instanceof ReadableStream"
          );

          const response = new Response(data);

          assert.deepStrictEqual(await response.text(), originalData);
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should support formData response type", async () => {
        const originalData = new FormData();

        originalData.append("x", "123");

        const server = await startHTTPServer(
          async (_req, res) => {
            const response = new Response(originalData);

            res.setHeader(
              "Content-Type",
              response.headers.get("Content-Type") ?? ""
            );

            res.end(await response.text());
          }
        );

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              responseType: "formdata",
            }
          );

          assert.ok(
            data instanceof FormData,
            "data is not instanceof FormData"
          );

          assert.deepStrictEqual(
            Object.fromEntries(data.entries()),
            Object.fromEntries(originalData.entries())
          );
        }
        finally {
          await stopHTTPServer(server);
        }
      }, 5000);

      it("should support json response type", async () => {
        const originalData = { x: "my data" };

        const server = await startHTTPServer(
          (_req, res) => res.end(JSON.stringify(originalData))
        );

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              responseType: "json",
            }
          );

          assert.deepStrictEqual(data, originalData);
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    });
  }
);
