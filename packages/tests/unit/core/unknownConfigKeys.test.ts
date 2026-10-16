import { describe, expect, it, vi } from "vitest";
import faxios from "#src/index.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { definePlugin } from "#src/lib/plugins/definePlugin.js";
import type { FaxiosContext, FaxiosRequestConfig } from "#src/lib/types.js";

const okFetch = () => vi.fn(async (_input: unknown, _init?: unknown) => new Response("ok"));

const rejection = async (promise: Promise<unknown>): Promise<FaxiosError> => {
  const err: unknown = await promise.then(
    () => { throw new Error("request unexpectedly resolved"); },
    (e: unknown) => e
  );
  expect(faxios.isFaxiosError(err)).toBe(true);
  return err as FaxiosError;
};

// Runtime callers aren't type-checked, so the config is widened the way untyped code passes it.
const untyped = (config: Record<string, unknown>) => config as FaxiosRequestConfig;

describe("core::Faxios unknown request config keys", () => {
  it("rejects a misspelt option with ERR_BAD_OPTION naming the key", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    const err = await rejection(api.get("http://example.test/", untyped({ timout: 50 })));
    expect(err.code).toBe(FaxiosError.ERR_BAD_OPTION);
    expect(err.message).toContain("timout");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts a request option an installed plugin declares, until the plugin is ejected", async () => {
    const fetch = okFetch();
    const tenant = definePlugin({
      name: "tenant",
      options: { tenant: true },
      middleware: async (ctx: FaxiosContext<{ tenant?: string; }>, next) => next(ctx),
    });
    const api = faxios.create({ env: { fetch } }).use(tenant);
    const res = await api.get("http://example.test/", { tenant: "acme" });
    expect(res.status).toBe(200);
    api.eject(tenant);
    const err = await rejection(api.get("http://example.test/", { tenant: "acme" }));
    expect(err.code).toBe(FaxiosError.ERR_BAD_OPTION);
    expect(err.message).toContain("tenant");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a plugin whose options aren't an object of names", () => {
    const api = faxios.create();
    let err: unknown;
    try {
      api.use({ name: "bad", options: [ "tenant" ] as never, middleware: async (ctx, next) => next(ctx) });
    }
    catch (e) {
      err = e;
    }
    expect((err as FaxiosError).code).toBe(FaxiosError.ERR_BAD_OPTION_VALUE);
  });

  it("rejects a removed axios option with a migration hint", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    const err = await rejection(api.get("http://example.test/", untyped({ adapter: "http" })));
    expect(err.code).toBe(FaxiosError.ERR_BAD_OPTION);
    expect(err.message).toContain("adapter");
    expect(err.message).toContain("env.fetch");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a wrongly cased option and names the option it differs from", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    const err = await rejection(api.get("/foo", untyped({ baseUrl: "http://example.test" })));
    expect(err.code).toBe(FaxiosError.ERR_BAD_OPTION);
    expect(err.message).toBe("Unknown option baseUrl; did you mean baseURL?");
    const xsrf = await rejection(api.get("http://example.test/", untyped({ withXsrfToken: true })));
    expect(xsrf.message).toBe("Unknown option withXsrfToken; did you mean withXSRFToken?");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects the removed responseType values document and response", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    for (const responseType of [ "document", "response" ]) {
      const err = await rejection(api.get("http://example.test/", untyped({ responseType })));
      expect(err.code).toBe(FaxiosError.ERR_BAD_OPTION_VALUE);
      expect(err.message).toContain("responseType");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects the removed transitional option clarifyTimeoutError", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    const err = await rejection(api.get("http://example.test/", untyped({ transitional: { clarifyTimeoutError: true } })));
    expect(err.code).toBe(FaxiosError.ERR_BAD_OPTION);
    expect(err.message).toContain("clarifyTimeoutError");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects the removed transitional option advertiseZstdAcceptEncoding", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    const err = await rejection(api.get("http://example.test/", untyped({ transitional: { advertiseZstdAcceptEncoding: true } })));
    expect(err.code).toBe(FaxiosError.ERR_BAD_OPTION);
    expect(err.message).toContain("advertiseZstdAcceptEncoding");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects the removed formDataHeaderPolicy option with a migration hint", async () => {
    const fetch = okFetch();
    const api = faxios.create({ env: { fetch } });
    const err = await rejection(api.post("http://example.test/", new FormData(), untyped({ formDataHeaderPolicy: "content-only" })));
    expect(err.code).toBe(FaxiosError.ERR_BAD_OPTION);
    expect(err.message).toContain("formDataHeaderPolicy");
    expect(err.message).toContain("global FormData");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("FaxiosRequestConfig removed options", () => {
  // Checked by `lint:ts`; `surfaces` is never called.
  // eslint-disable-next-line vitest/expect-expect -- type-only: the @ts-expect-error lines are the assertions
  it("no longer type-checks", () => {
    function surfaces(): Array<FaxiosRequestConfig> {
      return [
        // @ts-expect-error TS2353 -- responseEncoding was never read; text is decoded as UTF-8
        { responseEncoding: "latin1" },
        // @ts-expect-error TS2322 -- responseType "document" returned a string
        { responseType: "document" },
        // @ts-expect-error TS2322 -- responseType "response" returned a string
        { responseType: "response" },
        // @ts-expect-error TS2353 -- advertiseZstdAcceptEncoding never changed Accept-Encoding
        { transitional: { advertiseZstdAcceptEncoding: true } },
        // @ts-expect-error TS2353 -- timeouts always reject with ETIMEDOUT
        { transitional: { clarifyTimeoutError: true } },
        // @ts-expect-error TS2353 -- faxios always sends with fetch
        { adapter: "http" },
        // @ts-expect-error TS2353 -- formDataHeaderPolicy only applied to form-data package bodies
        { formDataHeaderPolicy: "content-only" },
      ];
    }
    void surfaces;
  });
});
