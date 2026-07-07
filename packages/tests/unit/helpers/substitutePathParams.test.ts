import assert from "node:assert";
import { describe, it } from "vitest";
import { substitutePathParams } from "#src/lib/helpers/substitutePathParams.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";

describe("substitutePathParams", () => {
  it("replaces a single placeholder", () => {
    assert.strictEqual(substitutePathParams("/users/{id}", { id: 42 }), "/users/42");
  });

  it("replaces multiple placeholders", () => {
    assert.strictEqual(
      substitutePathParams("/users/{userId}/posts/{postId}", { userId: 1, postId: 99 }),
      "/users/1/posts/99"
    );
  });

  it("encodes special chars with encodeURIComponent", () => {
    assert.strictEqual(
      substitutePathParams("/search/{q}", { q: "hello world" }),
      "/search/hello%20world"
    );
  });

  it("throws ERR_BAD_OPTION_VALUE for missing placeholder key", () => {
    assert.throws(
      () => substitutePathParams("/users/{id}", {}),
      (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION_VALUE
    );
  });

  it("silently ignores extra keys", () => {
    assert.strictEqual(
      substitutePathParams("/users/{id}", { id: 1, extra: "ignored" }),
      "/users/1"
    );
  });

  it("returns URL unchanged when no placeholders", () => {
    assert.strictEqual(substitutePathParams("/users/list", { id: 1 }), "/users/list");
  });

  it("returns URL unchanged for empty params and no placeholders", () => {
    assert.strictEqual(substitutePathParams("/static", {}), "/static");
  });

  it("coerces non-string values to string", () => {
    assert.strictEqual(substitutePathParams("/v/{ver}", { ver: 3.14 }), "/v/3.14");
  });
});
