import { describe, expectTypeOf, it } from "vitest";
import { FaxiosHeaders } from "#src/index.ts";
import type { FaxiosHeaderValue, FaxiosResponse, InternalFaxiosRequestConfig } from "#src/index.ts";
import type { FaxiosInstance } from "#src/index.ts";

// Type-checked by `lint:ts`; the functions are never called.
describe("FaxiosHeaders types", () => {
  it("types response.headers and request config headers as FaxiosHeaders", () => {
    expectTypeOf<FaxiosResponse["headers"]>().toEqualTypeOf<FaxiosHeaders>();
    expectTypeOf<InternalFaxiosRequestConfig["headers"]>().toEqualTypeOf<FaxiosHeaders>();
  });

  it("calls has, getSetCookie, the get accessors and for...of on response.headers without casts", () => {
    async function check(instance: FaxiosInstance) {
      const { headers } = await instance.get("/url");
      expectTypeOf(headers.has("x-request-id")).toEqualTypeOf<boolean>();
      expectTypeOf(headers.getSetCookie()).toEqualTypeOf<Array<string>>();
      expectTypeOf(headers.getContentType()).toEqualTypeOf<FaxiosHeaderValue | undefined>();
      expectTypeOf(headers.getContentType(true)).toEqualTypeOf<Record<string, string> | undefined>();
      expectTypeOf(headers.getContentType(/charset=(\S+)/)).toEqualTypeOf<null | RegExpExecArray | undefined>();
      expectTypeOf(headers.getContentType(value => String(value).length)).toEqualTypeOf<number | undefined>();
      expectTypeOf(headers.hasContentType(/json/)).toEqualTypeOf<boolean>();
      for (const [ name, value ] of headers) {
        expectTypeOf(name).toEqualTypeOf<string>();
        expectTypeOf(value).toEqualTypeOf<unknown>();
      }
    }
    expectTypeOf(check).toBeFunction();
  });

  it("gives every get accessor the overloads of get() minus the name", () => {
    expectTypeOf<Parameters<FaxiosHeaders["getAcceptEncoding"]>>().toEqualTypeOf<Parameters<FaxiosHeaders["getAuthorization"]>>();
    function check(headers: FaxiosHeaders) {
      expectTypeOf(headers.setUserAgent("ua", true)).toEqualTypeOf<FaxiosHeaders>();
      expectTypeOf(headers.getAuthorization()).toEqualTypeOf<FaxiosHeaderValue | undefined>();
      expectTypeOf(headers.getAuthorization(true)).toEqualTypeOf<Record<string, string> | undefined>();
    }
    expectTypeOf(check).toBeFunction();
  });

  it("rejects a matcher string as a get accessor parser", () => {
    function check(headers: FaxiosHeaders) {
      // @ts-expect-error TS2769 -- get accessors take a parser (true, RegExp or function), not a matcher string
      headers.getContentType("application/json");
      // @ts-expect-error TS2769 -- false is not a parser
      headers.getAccept(false);
    }
    expectTypeOf(check).toBeFunction();
  });

  it("types transformRequest and transformResponse headers as FaxiosHeaders", () => {
    function check(instance: FaxiosInstance) {
      void instance.get("/url", {
        transformRequest: (data: unknown, headers) => {
          expectTypeOf(headers).toEqualTypeOf<FaxiosHeaders>();
          return data;
        },
        transformResponse: (data: unknown, headers) => {
          expectTypeOf(headers).toEqualTypeOf<FaxiosHeaders>();
          return data;
        },
      });
    }
    expectTypeOf(check).toBeFunction();
  });
});
