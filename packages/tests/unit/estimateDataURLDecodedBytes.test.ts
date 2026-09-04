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
});
