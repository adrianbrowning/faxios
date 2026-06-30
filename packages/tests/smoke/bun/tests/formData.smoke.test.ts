import { describe, expect, test } from "bun:test";
import faxios from "faxios";

describe("form data", () => {
  test("native Bun FormData body produces multipart/form-data content-type", async () => {
    const form = new FormData();
    form.append("username", "janedoe");
    form.append("role", "admin");

    const mockFetch = async (input: Request) => {
      const contentType = input.headers.get("content-type") ?? "";
      const payload = await input.text();
      return new Response(JSON.stringify({ contentType, payload }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const response = await faxios.post("http://example.com/form", form, {
      adapter: "fetch",
      env: { fetch: mockFetch, Request, Response },
    });

    expect(response.data.contentType).toContain("multipart/form-data");
    expect(response.data.payload).toContain("name=\"username\"");
    expect(response.data.payload).toContain("janedoe");
    expect(response.data.payload).toContain("name=\"role\"");
    expect(response.data.payload).toContain("admin");
  });

  test("faxios.postForm helper produces multipart/form-data", async () => {
    const mockFetch = async (input: Request) => {
      const contentType = input.headers.get("content-type") ?? "";
      const payload = await input.text();
      return new Response(JSON.stringify({ contentType, payload }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const response = await faxios.postForm(
      "http://example.com/post-form",
      { project: "faxios", mode: "compat" },
      { adapter: "fetch", env: { fetch: mockFetch, Request, Response } }
    );

    expect(response.data.contentType).toContain("multipart/form-data");
    expect(response.data.payload).toContain("name=\"project\"");
    expect(response.data.payload).toContain("faxios");
    expect(response.data.payload).toContain("name=\"mode\"");
    expect(response.data.payload).toContain("compat");
  });
});
