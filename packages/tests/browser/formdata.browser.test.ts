import { describe, expect, it } from "vitest";

import faxios from "#src/index.js";

import { installFetchMock } from "./helpers/fetchMock.js";

describe("formdata (vitest browser)", () => {
  it("should allow FormData posting", async () => {
    using mock = installFetchMock();

    await (
      faxios as unknown as {
        postForm: (url: string, data: unknown) => Promise<unknown>;
      }
    ).postForm("/foo", {
      a: "foo",
      b: "bar",
    });

    const fd = await mock.lastRequest!.clone().formData();
    expect(fd.get("a")).toBe("foo");
    expect(fd.get("b")).toBe("bar");
  });
});
