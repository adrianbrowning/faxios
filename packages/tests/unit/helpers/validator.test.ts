import { describe, expect, it } from "vitest";
import faxios from "#src/index.ts";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import validator from "#src/lib/helpers/validator.js";

describe("validator::assertOptions", () => {
  it("should throw only if unknown an option was passed", () => {
    let error;
    try {
      validator.assertOptions(
        {
          x: true,
        },
        {
          y: validator.validators.boolean,
        },
        false
      );
    }
    catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(FaxiosError);
    expect((error as FaxiosError).message).toBe("Unknown option x");
    expect((error as FaxiosError).code).toBe(FaxiosError.ERR_BAD_OPTION);

    expect(() => {
      validator.assertOptions(
        {
          x: true,
        },
        {
          x: validator.validators.boolean,
          y: validator.validators.boolean,
        },
        false
      );
    }).not.toThrow(new Error("Unknown option x"));
  });

  it("should throw TypeError only if option type doesn't match", () => {
    let error;
    try {
      validator.assertOptions(
        {
          x: 123,
        },
        {
          x: validator.validators.boolean,
        },
        false
      );
    }
    catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(FaxiosError);
    expect((error as FaxiosError).message).toBe("option x must be a boolean");
    expect((error as FaxiosError).code).toBe(FaxiosError.ERR_BAD_OPTION_VALUE);

    expect(() => {
      validator.assertOptions(
        {
          x: true,
        },
        {
          x: validator.validators.boolean,
          y: validator.validators.boolean,
        },
        false
      );
    }).not.toThrow();
  });

  it("rejects null and non-object options with ERR_BAD_OPTION_VALUE", () => {
    for (const options of [ null, 5, "x" ]) {
      expect(() => validator.assertOptions(options, {}, true)).toThrow(
        expect.objectContaining({ isFaxiosError: true, code: FaxiosError.ERR_BAD_OPTION_VALUE })
      );
    }
  });

  it("attaches the config it was given to the error", () => {
    const config = { url: "/x" };
    expect(() => validator.assertOptions({ x: 1 }, {}, false, config)).toThrow(
      expect.objectContaining({ code: FaxiosError.ERR_BAD_OPTION, config })
    );
    expect(() => validator.assertOptions({ x: 1 }, { x: validator.validators.boolean }, false, config)).toThrow(
      expect.objectContaining({ code: FaxiosError.ERR_BAD_OPTION_VALUE, config })
    );
    expect(() => validator.assertOptions(null, {}, false, config)).toThrow(
      expect.objectContaining({ code: FaxiosError.ERR_BAD_OPTION_VALUE, config })
    );
  });
});

describe("serializer option validation on a request", () => {
  const fetch = async () => new Response(null, { status: 200 });

  it("rejects an unknown paramsSerializer key with ERR_BAD_OPTION and the config", async () => {
    const error = await faxios.get("https://x.example/a", {
      params: { a: [ 1 ] },
      paramsSerializer: { indexs: true } as never,
      env: { fetch },
    }).then(() => undefined, (err: unknown) => err as FaxiosError);
    expect(error).toMatchObject({ code: FaxiosError.ERR_BAD_OPTION, message: "Unknown option indexs" });
    expect(error?.config?.url).toBe("https://x.example/a");
  });

  it("rejects an unknown formSerializer key with ERR_BAD_OPTION and the config", async () => {
    const error = await faxios.post("https://x.example/a", { a: 1 }, {
      formSerializer: { dot: true } as never,
      env: { fetch },
    }).then(() => undefined, (err: unknown) => err as FaxiosError);
    expect(error).toMatchObject({ code: FaxiosError.ERR_BAD_OPTION, message: "Unknown option dot" });
    expect(error?.config?.url).toBe("https://x.example/a");
  });

  it.each([ NaN, -1 ])("rejects paramsSerializer maxDepth %j with ERR_BAD_OPTION_VALUE", async maxDepth => {
    await expect(faxios.get("https://x.example/a", { params: { a: 1 }, paramsSerializer: { maxDepth }, env: { fetch } }))
      .rejects.toMatchObject({ code: FaxiosError.ERR_BAD_OPTION_VALUE, message: "option maxDepth must be a non-negative integer or Infinity" });
  });

  it("rejects a non-boolean paramsSerializer.indexes value", async () => {
    await expect(faxios.get("https://x.example/a", { params: { a: 1 }, paramsSerializer: { indexes: "yes" as never }, env: { fetch } }))
      .rejects.toMatchObject({ code: FaxiosError.ERR_BAD_OPTION_VALUE });
  });

  it("accepts every documented serializer option", async () => {
    const response = await faxios.post("https://x.example/a", { a: [ 1 ] }, {
      params: { a: [ 1 ] },
      paramsSerializer: { dots: true, indexes: null, maxDepth: Infinity, metaTokens: false, encode: v => v },
      formSerializer: { dots: false, indexes: true, maxDepth: 10, metaTokens: true },
      env: { fetch },
    });
    expect(response.status).toBe(200);
  });
});
