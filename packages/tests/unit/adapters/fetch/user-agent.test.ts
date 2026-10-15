import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { describe, it } from "vitest";
import { VERSION } from "#src/lib/env/data.js";
import {
  startHTTPServer,
  stopHTTPServer
} from "../../../setup/server.js";
import { fetchFaxios } from "./_helpers.js";

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    describe("fetch adapter - User-Agent header", () => {
      it("should set User-Agent header to faxios/<version> by default", async () => {
        const server = await startHTTPServer(
          (req, res) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ userAgent: req.headers["user-agent"] }));
          }
        );

        try {
          const { data } = await fetchFaxios.post<Record<string, unknown>>(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              payload: "test",
            }
          );

          assert.strictEqual(data.userAgent, `faxios/${VERSION}`);
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should not override a user-provided User-Agent header", async () => {
        const customUA = "my-custom-agent/1.0";

        const server = await startHTTPServer(
          (req, res) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ userAgent: req.headers["user-agent"] }));
          }
        );

        try {
          const { data } = await fetchFaxios.post<Record<string, unknown>>(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            { payload: "test" },
            { headers: { "User-Agent": customUA } }
          );

          assert.strictEqual(data.userAgent, customUA);
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    });
  }
);
