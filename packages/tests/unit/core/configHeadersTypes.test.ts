import { describe, it, expectTypeOf } from "vitest";
import faxios, { create, FaxiosHeaders } from "#src/index.ts";
import type { CreateFaxiosDefaults, FaxiosConfigHeaders, FaxiosRequestConfig, HeadersDefaults, RawFaxiosRequestHeaders } from "#src/index.ts";

// These functions are type-checked by `lint:ts` and never called: each call
// site passes a fresh object literal so excess-property and value checks apply.
const url = "http://example.test/";

describe("config headers types", () => {
  it("uses one header type for request config and create()", () => {
    expectTypeOf<FaxiosRequestConfig["headers"]>().toEqualTypeOf<FaxiosConfigHeaders | undefined>();
    expectTypeOf<CreateFaxiosDefaults["headers"]>().toEqualTypeOf<FaxiosConfigHeaders | undefined>();
    expectTypeOf<keyof HeadersDefaults>().toEqualTypeOf<
      "common" | "delete" | "get" | "head" | "options" | "post" | "put" | "patch" | "purge" | "link" | "unlink" | "query"
    >();
  });

  it("accepts suggested and custom keys, every header value, and mixed method header groups on every surface", () => {
    function surfaces(): void {
      void faxios({ url, headers: { Accept: "application/json", "x-custom": "a", "Content-Type": "application/json", Range: null, "X-Gone": undefined, "User-Agent": false, "Content-Length": 3, "X-List": [ "a", "b" ], common: { Authorization: "t" }, options: { "X-Opt": "o" } } });
      void faxios.request({ url, headers: { Accept: "application/json", "x-custom": "a", "Content-Type": "application/json", Range: null, "X-Gone": undefined, "User-Agent": false, "Content-Length": 3, "X-List": [ "a", "b" ], common: { Authorization: "t" }, options: { "X-Opt": "o" } } });
      void faxios.get(url, { headers: { Accept: "application/json", "x-custom": "a", "Content-Type": "application/json", Range: null, "X-Gone": undefined, "User-Agent": false, "Content-Length": 3, "X-List": [ "a", "b" ], common: { Authorization: "t" }, options: { "X-Opt": "o" } } });
      void faxios.post(url, {}, { headers: { Accept: "application/json", "x-custom": "a", "Content-Type": "application/json", Range: null, "X-Gone": undefined, "User-Agent": false, "Content-Length": 3, "X-List": [ "a", "b" ], common: { Authorization: "t" }, options: { "X-Opt": "o" } } });
      faxios.create({ headers: { Accept: "application/json", "x-custom": "a", "Content-Type": "application/json", Range: null, "X-Gone": undefined, "User-Agent": false, "Content-Length": 3, "X-List": [ "a", "b" ], common: { Authorization: "t" }, options: { "X-Opt": "o" } } });
      create({ headers: { Accept: "application/json", "x-custom": "a", "Content-Type": "application/json", Range: null, "X-Gone": undefined, "User-Agent": false, "Content-Length": 3, "X-List": [ "a", "b" ], common: { Authorization: "t" }, options: { "X-Opt": "o" } } });
      const endpoint = faxios.define("GET", url, { headers: { Accept: "application/json", "x-custom": "a", "Content-Type": "application/json", Range: null, "X-Gone": undefined, "User-Agent": false, "Content-Length": 3, "X-List": [ "a", "b" ], common: { Authorization: "t" }, options: { "X-Opt": "o" } } });
      void endpoint({ headers: { Accept: "application/json", "x-custom": "a", "Content-Type": "application/json", Range: null, "X-Gone": undefined, "User-Agent": false, "Content-Length": 3, "X-List": [ "a", "b" ], common: { Authorization: "t" }, options: { "X-Opt": "o" } } });
      const route = faxios.route(url, { headers: { Accept: "application/json", "x-custom": "a", "Content-Type": "application/json", Range: null, "X-Gone": undefined, "User-Agent": false, "Content-Length": 3, "X-List": [ "a", "b" ], common: { Authorization: "t" }, options: { "X-Opt": "o" } } });
      void route.get({ headers: { Accept: "application/json", "x-custom": "a", "Content-Type": "application/json", Range: null, "X-Gone": undefined, "User-Agent": false, "Content-Length": 3, "X-List": [ "a", "b" ], common: { Authorization: "t" }, options: { "X-Opt": "o" } } })();
    }
    expectTypeOf(surfaces).toBeFunction();
  });

  it("accepts an arbitrary MIME string, method header groups alone, and a FaxiosHeaders instance", () => {
    function shapes(): void {
      void faxios.get(url, { headers: { "Content-Type": "application/vnd.example+json" } });
      void faxios.get(url, { headers: { common: { Accept: "text/plain" }, purge: {}, link: {}, unlink: {}, query: {} } });
      void faxios.get(url, { headers: new FaxiosHeaders({ "X-From": "instance" }) });
      faxios.create({ headers: new FaxiosHeaders({ "X-From": "instance" }) });
      const bag: RawFaxiosRequestHeaders = { Authorization: "t" };
      void faxios.get(url, { headers: bag });
    }
    expectTypeOf(shapes).toBeFunction();
  });

  it("rejects object and function header values on every surface, alone or next to a method header group", () => {
    function surfaces(): void {
      // @ts-expect-error TS2769 object value
      void faxios({ url, headers: { "X-Obj": { a: 1 } } });
      // @ts-expect-error TS2769 function value next to a group
      void faxios({ url, headers: { "X-Fn": () => "v", common: {} } });
      // @ts-expect-error TS2769 object value
      void faxios.request({ url, headers: { "X-Obj": { a: 1 } } });
      // @ts-expect-error TS2769 function value next to a group
      void faxios.request({ url, headers: { "X-Fn": () => "v", common: {} } });
      // @ts-expect-error TS2769 object value
      void faxios.get(url, { headers: { "X-Obj": { a: 1 } } });
      // @ts-expect-error TS2769 function value next to a group
      void faxios.get(url, { headers: { "X-Fn": () => "v", common: {} } });
      // @ts-expect-error TS2769 object value
      void faxios.post(url, {}, { headers: { "X-Obj": { a: 1 } } });
      // @ts-expect-error TS2769 function value next to a group
      void faxios.post(url, {}, { headers: { "X-Fn": () => "v", common: {} } });
      // @ts-expect-error TS2353 object value
      faxios.create({ headers: { "X-Obj": { a: 1 } } });
      // @ts-expect-error TS2322 function value next to a group
      create({ headers: { "X-Fn": () => "v", common: {} } });
      // @ts-expect-error TS2353 object value
      faxios.define("GET", url, { headers: { "X-Obj": { a: 1 } } });
      // @ts-expect-error TS2322 function value next to a group
      faxios.define("GET", url, { headers: { "X-Fn": () => "v", common: {} } });
      // @ts-expect-error TS2353 object value
      void faxios.define("GET", url)({ headers: { "X-Obj": { a: 1 } } });
      // @ts-expect-error TS2353 object value
      faxios.route(url, { headers: { "X-Obj": { a: 1 } } });
      // @ts-expect-error TS2322 function value next to a group
      faxios.route(url).get({ headers: { "X-Fn": () => "v", common: {} } });
      // @ts-expect-error TS2769 object value inside a method header group
      void faxios.get(url, { headers: { post: { "X-Obj": { a: 1 } } } });
      // @ts-expect-error TS2769 a suggested header still rejects an object value
      void faxios.get(url, { headers: { Authorization: { a: 1 }, common: {} } });
    }
    expectTypeOf(surfaces).toBeFunction();
  });
});
