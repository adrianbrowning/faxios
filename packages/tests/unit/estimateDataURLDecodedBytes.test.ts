import assert from "node:assert";
import { describe, it } from "vitest";
import estimateDataURLDecodedBytes from "#src/lib/helpers/estimateDataURLDecodedBytes.js";

describe("estimateDataURLDecodedBytes", () => {
  it("should return 0 for non-data URLs", () => {
    assert.strictEqual(estimateDataURLDecodedBytes("http://example.com"), 0);
  });

  it("should calculate length for simple non-base64 data URL", () => {
    const url = "data:,Hello";
    assert.strictEqual(
      estimateDataURLDecodedBytes(url),
      Buffer.byteLength("Hello", "utf8")
    );
  });

  it("should calculate decoded length for percent-encoded non-base64 data URL", () => {
    const url = "data:text/plain,%E2%82%AC";
    assert.strictEqual(
      estimateDataURLDecodedBytes(url),
      Buffer.byteLength("\u20ac", "utf8")
    );
  });

  it("should count percent-encoded ASCII as one decoded byte", () => {
    const url = "data:text/plain,hello%20world";
    assert.strictEqual(
      estimateDataURLDecodedBytes(url),
      Buffer.byteLength("hello world", "utf8")
    );
  });

  it("should calculate decoded length for base64 data URL", () => {
    const str = "Hello";
    const b64 = Buffer.from(str, "utf8").toString("base64");
    const url = `data:text/plain;base64,${b64}`;
    assert.strictEqual(estimateDataURLDecodedBytes(url), str.length);
  });

  it("should handle base64 with = padding", () => {
    const url = "data:text/plain;base64,TQ==";
    assert.strictEqual(estimateDataURLDecodedBytes(url), 1);
  });

  it("should handle base64 with %3D padding", () => {
    const url = "data:text/plain;base64,TQ%3D%3D";
    assert.strictEqual(estimateDataURLDecodedBytes(url), 1);
  });

  // The estimate gates maxContentLength before the body is materialized, so it
  // must never come in UNDER the real decoded size. Node's Buffer is used as an
  // independent oracle rather than restating the estimator's own arithmetic.
  it("should never under-estimate an unpadded base64 body", () => {
    const unpaddedBodies = [
      "QUJDRA", // 6 significant chars -> 4 bytes
      "QUJDRAV", // 7 significant chars -> 5 bytes
      "QQ", // 2 significant chars -> 1 byte
      "QUJ", // 3 significant chars -> 2 bytes
    ];

    for (const body of unpaddedBodies) {
      const actual = Buffer.from(body, "base64").length;
      const estimated = estimateDataURLDecodedBytes(
        `data:application/octet-stream;base64,${body}`
      );

      assert.ok(
        estimated >= actual,
        `estimate ${estimated} under-counts ${actual} bytes for "${body}"`
      );
    }
  });

  it("should not let whitespace in a base64 body under-count the payload", () => {
    const body = "QUJDRA==";
    const spaced = "QU\n JD\tRA==";

    assert.ok(
      estimateDataURLDecodedBytes(
        `data:application/octet-stream;base64,${spaced}`
      ) >= Buffer.from(body, "base64").length
    );
  });

  // `;base64` only marks a base64 body when it terminates the metadata. When it
  // appears mid-metadata the body is raw text, decoding 1:1 instead of 3:4, so
  // scoring it as base64 under-counts by 25% and lets an oversized payload past
  // the maxContentLength pre-check. `fetch` itself is the oracle here — the
  // estimate must bound whatever the runtime actually decodes.
  it("should not treat a mid-metadata `;base64` as a base64 body", async () => {
    const raw = "A".repeat(4000);
    const urls = [
      `data:text/plain;base64;x,${raw}`,
      `data:text/plain;base64=1,${raw}`,
    ];

    for (const url of urls) {
      const actual = (await (await fetch(url)).arrayBuffer()).byteLength;
      const estimated = estimateDataURLDecodedBytes(url);

      assert.ok(
        estimated >= actual,
        `estimate ${estimated} under-counts ${actual} bytes for "${url.slice(0, 40)}…"`
      );
    }
  });

  it("should still recognize a terminating `;base64` marker", () => {
    assert.strictEqual(estimateDataURLDecodedBytes("data:text/plain;base64,QUJDREVG"), 6);
    assert.strictEqual(estimateDataURLDecodedBytes("data:;base64,QUJDREVG"), 6);
    assert.strictEqual(estimateDataURLDecodedBytes("data:text/plain;charset=utf-8;base64,QUJDREVG"), 6);
  });
});
