import { describe, expect, test } from "bun:test";
import faxios from "faxios";
import type { MockFetch } from "./helpers.ts";
import { jsonResponse, toRequest } from "./helpers.ts";

type Echo = { contentType: string; payload: string; };

// Answers with the request's Content-Type and the body it received.
const echoFetch: MockFetch = async (input, init) => {
  const request = toRequest(input, init);
  return jsonResponse({ contentType: request.headers.get("content-type") ?? "", payload: await request.text() });
};

describe("form data", () => {
  test("native Bun FormData body produces multipart/form-data content-type", async () => {
    const form = new FormData();
    form.append("username", "janedoe");
    form.append("role", "admin");

    const response = await faxios.post<Echo>("http://example.com/form", form, { env: { fetch: echoFetch } });

    expect(response.data.contentType).toContain("multipart/form-data");
    expect(response.data.payload).toContain("name=\"username\"");
    expect(response.data.payload).toContain("janedoe");
    expect(response.data.payload).toContain("name=\"role\"");
    expect(response.data.payload).toContain("admin");
  });

  test("faxios.postForm helper produces multipart/form-data", async () => {
    const response = await faxios.postForm<Echo>(
      "http://example.com/post-form",
      { project: "faxios", mode: "compat" },
      { env: { fetch: echoFetch } }
    );

    expect(response.data.contentType).toContain("multipart/form-data");
    expect(response.data.payload).toContain("name=\"project\"");
    expect(response.data.payload).toContain("faxios");
    expect(response.data.payload).toContain("name=\"mode\"");
    expect(response.data.payload).toContain("compat");
  });
});
