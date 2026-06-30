import faxios from "faxios";
import { describe, expect, it } from "vitest";

describe("formData compat (dist export only)", () => {
  it("supports posting FormData instances", async () => {
    const form = new FormData();
    form.append("username", "janedoe");
    form.append("role", "admin");

    const mockFetch = async input => {
      const contentType = input.headers.get("content-type") ?? "";
      const payload = await input.text();
      return new Response(JSON.stringify({ contentType, payload }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const response = await faxios.post("http://example.com/form", form, {
      env: { fetch: mockFetch, Request, Response },
    });

    expect(response.data.contentType).toContain("multipart/form-data");
    expect(response.data.payload).toContain("name=\"username\"");
    expect(response.data.payload).toContain("janedoe");
    expect(response.data.payload).toContain("name=\"role\"");
    expect(response.data.payload).toContain("admin");
  });

  it("supports faxios.postForm helper", async () => {
    const mockFetch = async input => {
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
      {
        env: { fetch: mockFetch, Request, Response },
      }
    );

    expect(response.data.contentType).toContain("multipart/form-data");
    expect(response.data.payload).toContain("name=\"project\"");
    expect(response.data.payload).toContain("faxios");
    expect(response.data.payload).toContain("name=\"mode\"");
    expect(response.data.payload).toContain("compat");
  });
});
