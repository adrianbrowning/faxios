import { describe, it, expect } from "vitest";
import transformData from "#src/lib/core/transformData.js";

describe("core::transformData", () => {
  it("supports a single transformer", () => {
    const data = transformData.call({}, (_value: unknown) => "foo");

    expect(data).toBe("foo");
  });

  it("supports an array of transformers", () => {
    const data = transformData.call({ data: "" }, [
      (value: unknown) => (value as string) + "f",
      (value: unknown) => (value as string) + "o",
      (value: unknown) => (value as string) + "o",
    ]);

    expect(data).toBe("foo");
  });

  it("passes headers through to transformers", () => {
    const headers = {
      "content-type": "foo/bar",
    };

    const data = transformData.call(
      {
        data: "",
        headers,
      },
      [
        (value: unknown, currentHeaders: unknown) =>
          (value as string) + (currentHeaders as Record<string, string>)["content-type"],
      ]
    );

    expect(data).toBe("foo/bar");
  });

  it("passes status code through to transformers", () => {
    const data = transformData.call(
      {},
      [
        (value: unknown, _headers: unknown, status: number | undefined) =>
          (value as string) + status,
      ],
      { data: "", status: 200 }
    );

    expect(data).toBe("200");
  });
});
