import { afterEach, describe, expect, it } from "vitest";

import { create, FaxiosError } from "#src/core.js";
import { form } from "#src/form.js";

import { installFetchMock } from "./helpers/fetchMock.js";
import type { FetchMockController } from "./helpers/fetchMock.js";

describe("@gcmdev/faxios/core (vitest browser)", () => {
  let mock: FetchMockController | undefined;

  afterEach(() => {
    mock?.[Symbol.dispose]();
    mock = undefined;
  });

  it("should send a multipart object body as the browser's FormData once form() is installed", async () => {
    mock = installFetchMock();
    await create().use(form())
      .postForm("/upload", { name: "a", file: new Blob([ "x" ], { type: "text/plain" }) });

    const body = await mock.lastRequest!.formData();
    expect(body.get("name")).toBe("a");
    expect(body.get("file")).toBeInstanceOf(Blob);
  });

  it("should reject a multipart object body with ERR_NOT_SUPPORT without form()", async () => {
    mock = installFetchMock();
    const err = await create().postForm("/upload", { name: "a" })
      .catch((error: unknown) => error);

    expect(err).toBeInstanceOf(FaxiosError);
    expect((err as FaxiosError).code).toBe(FaxiosError.ERR_NOT_SUPPORT);
    expect(mock.requests).toHaveLength(0);
  });
});
