import assert from "node:assert";
import fs from "node:fs";
import https from "node:https";
import type { AddressInfo } from "node:net";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import axios from "../../../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getClosedPort = async () =>
  new Promise(resolve => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });

describe("adapters - network-error details", () => {
  it("should expose ECONNREFUSED and set error.cause on connection refusal", async () => {
    const port = await getClosedPort();

    try {
      await (
        axios as unknown as {
          get: (url: string, config?: unknown) => Promise<unknown>;
        }
      ).get(`http://127.0.0.1:${port}`, { timeout: 500 });
      assert.fail("request unexpectedly succeeded");
    }
    catch (err) {
      const e = err as Error & { isFaxiosError: boolean; code: string; };
      assert.ok(e instanceof Error, "should be an Error");
      assert.strictEqual(e.isFaxiosError, true, "isFaxiosError should be true");

      assert.strictEqual(e.code, "ECONNREFUSED");
      assert.ok("cause" in e, "error.cause should exist");
      assert.ok(e.cause instanceof Error, "cause should be an Error");
       
      assert.strictEqual(
        (e.cause as NodeJS.ErrnoException).code,
        "ECONNREFUSED"
      );

      assert.strictEqual(typeof e.message, "string");
    }
  });

  it("should expose self-signed TLS error and set error.cause", async () => {
    const certsDir = __dirname;
    const keyPath = path.join(certsDir, "key.pem");
    const certPath = path.join(certsDir, "cert.pem");

    const key = fs.readFileSync(keyPath);
    const cert = fs.readFileSync(certPath);

    const httpsServer = https.createServer({ key, cert }, (_req, res) =>
      res.end("ok")
    );

    await new Promise<void>(resolve =>
      httpsServer.listen(0, "127.0.0.1", resolve)
    );
    const { port } = httpsServer.address() as AddressInfo;

    try {
      await (
        axios as unknown as {
          get: (url: string, config?: unknown) => Promise<unknown>;
        }
      ).get(`https://127.0.0.1:${port}`, {
        timeout: 500,
        httpsAgent: new https.Agent({ rejectUnauthorized: true }),
      });
      assert.fail("request unexpectedly succeeded");
    }
    catch (err) {
      const e = err as Error & { code: string; };
      const codeStr = String(e.code);
      assert.ok(
        /SELF_SIGNED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO/.test(codeStr),
        `unexpected TLS code: ${codeStr}`
      );

      assert.ok("cause" in e, "error.cause should exist");
      assert.ok(e.cause instanceof Error, "cause should be an Error");
       
      const causeCode = String(
        (e.cause as NodeJS.ErrnoException).code
      );
      assert.ok(
        /SELF_SIGNED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO/.test(
          causeCode
        ),
        `unexpected cause code: ${causeCode}`
      );

      assert.strictEqual(typeof e.message, "string");
    }
    finally {
      await new Promise<void>(resolve => httpsServer.close(() => resolve()));
    }
  });
});
