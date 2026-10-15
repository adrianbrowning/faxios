import { assertStringIncludes } from "@std/assert";
import faxios from "faxios";
import type { MockFetch } from "./helpers.ts";
import { jsonResponse } from "./helpers.ts";

type Echo = { contentType: string; payload: string; };

// Answers with the request's Content-Type and the body it received.
const echoFetch: MockFetch = async (input, init) => {
  const request = new Request(input, init);
  return jsonResponse({ contentType: request.headers.get("content-type") ?? "", payload: await request.text() });
};

Deno.test("form data: native Deno FormData body produces multipart/form-data content-type", async () => {
  const form = new FormData();
  form.append("username", "janedoe");
  form.append("role", "admin");

  const response = await faxios.post<Echo>("http://example.com/form", form, { env: { fetch: echoFetch } });

  assertStringIncludes(response.data.contentType, "multipart/form-data");
  assertStringIncludes(response.data.payload, "name=\"username\"");
  assertStringIncludes(response.data.payload, "janedoe");
  assertStringIncludes(response.data.payload, "name=\"role\"");
  assertStringIncludes(response.data.payload, "admin");
});

Deno.test("form data: faxios.postForm helper produces multipart/form-data", async () => {
  const response = await faxios.postForm<Echo>(
    "http://example.com/post-form",
    { project: "faxios", mode: "compat" },
    { env: { fetch: echoFetch } }
  );

  assertStringIncludes(response.data.contentType, "multipart/form-data");
  assertStringIncludes(response.data.payload, "name=\"project\"");
  assertStringIncludes(response.data.payload, "faxios");
  assertStringIncludes(response.data.payload, "name=\"mode\"");
  assertStringIncludes(response.data.payload, "compat");
});
