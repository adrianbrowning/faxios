import { describe, expect, it } from "vitest";
import FaxiosHeaders from "#src/lib/core/FaxiosHeaders.js";
import transformData from "#src/lib/core/transformData.js";
import type { InternalFaxiosRequestConfig } from "#src/lib/types.js";

const config = (fields: Partial<InternalFaxiosRequestConfig> = {}): InternalFaxiosRequestConfig => ({ headers: new FaxiosHeaders(), ...fields });

describe("core::transformData", () => {
  it("supports a single transformer", () => {
    const data = transformData(config(), (_value: unknown) => "foo");

    expect(data).toBe("foo");
  });

  it("supports an array of transformers", () => {
    const data = transformData(config({ data: "" }), [
      (value: unknown) => (value as string) + "f",
      (value: unknown) => (value as string) + "o",
      (value: unknown) => (value as string) + "o",
    ]);

    expect(data).toBe("foo");
  });

  it("passes headers through to transformers", () => {
    const data = transformData(
      config({ data: "", headers: new FaxiosHeaders({ "content-type": "foo/bar" }) }),
      [
        (value: unknown, currentHeaders: FaxiosHeaders) => (value as string) + String(currentHeaders.get("content-type")),
      ]
    );

    expect(data).toBe("foo/bar");
  });

  it("passes status code through to transformers", () => {
    const data = transformData(
      config(),
      [
        (value: unknown, _headers: unknown, status: number | undefined) =>
          (value as string) + status,
      ],
      { data: "", status: 200 }
    );

    expect(data).toBe("200");
  });

  it("calls transformers with the config as this", () => {
    const requestConfig = config({ data: "x" });
    let seen: unknown;

    transformData(requestConfig, function (this: unknown, value: unknown) {
      seen = this;
      return value;
    });

    expect(seen).toBe(requestConfig);
  });
});
