import { describe, it, expect } from "vitest";
import HttpStatusCode from "#src/lib/helpers/HttpStatusCode.js";

describe("helpers::HttpStatusCode", () => {
  it("exposes the RFC 9110 names for 413 and 422", () => {
    expect(HttpStatusCode.ContentTooLarge).toBe(413);
    expect(HttpStatusCode.UnprocessableContent).toBe(422);
  });

  it("keeps the legacy names as aliases", () => {
    expect(HttpStatusCode.PayloadTooLarge).toBe(413);
    expect(HttpStatusCode.UnprocessableEntity).toBe(422);
  });

  it("keeps the first declared name in the reverse mapping", () => {
    const reverse = HttpStatusCode as unknown as Record<number, string>;

    expect(reverse[413]).toBe("PayloadTooLarge");
    expect(reverse[422]).toBe("UnprocessableEntity");
  });

  it("exposes Cloudflare 520", () => {
    const reverse = HttpStatusCode as unknown as Record<number, string>;

    expect(HttpStatusCode.WebServerReturnsAnUnknownError).toBe(520);
    expect(reverse[520]).toBe("WebServerReturnsAnUnknownError");
  });
});
