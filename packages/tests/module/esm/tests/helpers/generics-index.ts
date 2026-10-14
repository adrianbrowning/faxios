// Type-checked fixture (NO @ts-nocheck) guarding the public type surface:
// - <T, D> generics on request methods, which always resolve to FaxiosResponse<T, D>
// - request-body D typing
// - removal of the FaxiosInstance catch-all index signature
// - typed FaxiosHeaders accessors (no longer `unknown`)
// - serializer maxDepth, nullable env.Request/env.Response, and the global fetch/Request/Response as env
// - instance defaults typed as header buckets plus request config
// - isFaxiosError/isCancel narrow `unknown` as type predicates
// - env.FormData accepts the runtime FormData constructor (and null)
// - request and response headers are FaxiosHeaders; accessors match the ones registered at runtime
// - header `rewrite` is boolean only (a function was never honoured)
// - all/spread/formToJSON, mergeConfig, header inputs, error codes, HttpStatusCode and fetchOptions
//   are typed to match the runtime
import faxios, { all, CanceledError, FaxiosError, FaxiosHeaders, formToJSON, HttpStatusCode, isCancel, isFaxiosError, mergeConfig } from "faxios";
import type { FaxiosErrorCode, FaxiosHeaderValue, FaxiosRequestConfig, FaxiosResponse } from "faxios";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

type User = { id: number; name: string; };

async function generics(): Promise<void> {
  // T threads to response data
  const r1 = await faxios.post<User>("/user", { name: "a" });
  const id: number = r1.data.id;
  const name: string = r1.data.name;
  void id;
  void name;

  // D types the request body
  const r2 = await faxios.request<User, { q: string; }>({
    url: "/user",
    data: { q: "search" },
  });
  void r2.data.id;
  const sameResponse: Equal<typeof r2, FaxiosResponse<User, { q: string; }>> = true;
  void sameResponse;

  // No R generic: middleware always resolves a FaxiosResponse, so the result can't be retyped
  // @ts-expect-error TS2322 -- the second type argument is D; the result is a FaxiosResponse
  const r3: string = await faxios.get<User, string>("/user");
  // @ts-expect-error TS2558 -- the methods take two type arguments, <T, D>
  void faxios.get<User, User, unknown>("/user");
  // @ts-expect-error TS2739 -- data, not the response, is a User
  const u: User = await faxios.get<User>("/user");
  void r3;
  void u;
}

function headerAccessorsAreTyped(): void {
  const h = new FaxiosHeaders({ "Content-Type": "application/json" });
  // get() is FaxiosHeaderValue | undefined, not unknown
  const ct = h.getContentType();
  if (typeof ct === "string") {
    const upper: string = ct.toUpperCase();
    void upper;
  }
  const has: boolean = h.hasContentType();
  void has;
}

function requestHeaderAccessorsMatchRuntime(): void {
  faxios.create({
    transformRequest: [ (data: unknown, headers) => {
      // getAcceptEncoding() returns exactly what get("Accept-Encoding") returns
      const encoding = headers.getAcceptEncoding();
      const viaGet = headers.get("Accept-Encoding");
      const sameAsGet: Equal<typeof encoding, typeof viaGet> = true;
      const chained: FaxiosHeaders = headers.setAcceptEncoding("gzip, br", true);
      const has: boolean = headers.hasAcceptEncoding(/gzip/);
      void sameAsGet;
      void chained;
      void has;

      // @ts-expect-error - no Content-Encoding accessor is registered at runtime
      headers.getContentEncoding();
      // @ts-expect-error - no Content-Encoding accessor is registered at runtime
      headers.setContentEncoding("gzip");
      // @ts-expect-error - no Content-Encoding accessor is registered at runtime
      headers.hasContentEncoding();
      return data;
    } ],
  });
}

async function responseHeadersAreFaxiosHeaders(): Promise<void> {
  const { headers } = await faxios.get("/user");
  const has: boolean = headers.has("x-request-id");
  const cookies: Array<string> = headers.getSetCookie();
  const tokens: Record<string, string> | undefined = headers.getContentType(true);
  const match: null | RegExpExecArray | undefined = headers.getContentType(/charset=(\S+)/);
  const length: number | undefined = headers.getContentType(value => String(value).length);
  for (const [ name ] of headers) {
    const key: string = name;
    void key;
  }
  void has;
  void cookies;
  void tokens;
  void match;
  void length;

  // @ts-expect-error - get accessors take a parser, not a matcher string
  headers.getContentType("application/json");
}

function headerRewriteIsBoolean(requestHeaders: FaxiosHeaders): void {
  const h = new FaxiosHeaders({ "X-A": "old" });
  h.set("X-A", "v", true);
  h.set("X-A", "v", false);
  h.set("X-A", "v");
  h.setContentType("text/plain", true);
  h.setAuthorization("Bearer t", false);
  h.setAccept("*/*");
  requestHeaders.set("X-A", "v", true);
  requestHeaders.setContentType("text/plain", false);

  // @ts-expect-error - rewrite is boolean; a function was never called
  h.set("X-A", "v", () => true);
  // @ts-expect-error - accessor rewrite is boolean; a function was never called
  h.setContentType("text/plain", () => true);
  // @ts-expect-error - request headers rewrite is boolean
  requestHeaders.set("X-A", "v", () => true);
  // @ts-expect-error - request headers accessor rewrite is boolean
  requestHeaders.setAuthorization("Bearer t", () => true);
  // @ts-expect-error - request headers accessor rewrite is boolean
  requestHeaders.setAcceptEncoding("gzip", () => true);
}

function indexSignatureRemoved(): void {
  // @ts-expect-error - FaxiosInstance no longer has a catch-all index signature
  faxios.thisMemberDoesNotExist;
}

function requestBodyIsTyped(): void {
  // @ts-expect-error - body must match D ({ name: string })
  void faxios.post<User, { name: string; }>("/user", { wrong: 1 });
}

function serializerAndEnvOptionsAreTyped(): void {
  faxios.create({
    formSerializer: { maxDepth: 10 },
    paramsSerializer: { maxDepth: Infinity },
    env: { fetch: globalThis.fetch, Request: null, Response: null },
  });
  void faxios.get("/x", { env: { fetch, Request, Response } });
  // @ts-expect-error - maxDepth is a number
  faxios.create({ formSerializer: { maxDepth: "10" } });
}

function defaultsAreTyped(): void {
  // The root instance: axios-style per-method header buckets
  faxios.defaults.headers.common["Authorization"] = "Bearer x";
  faxios.defaults.headers.post["Content-Type"] = "application/x-www-form-urlencoded";
  // A key set directly on defaults.headers applies to every method
  faxios.defaults.headers["X-Flat"] = "1";
  faxios.defaults.timeout = 1000;
  faxios.defaults.baseURL = "https://api.example.com";

  // create() returns an instance with the same defaults shape
  const instance = faxios.create({ baseURL: "https://api.example.com" });
  instance.defaults.headers.common["X-A"] = "1";
  instance.defaults.headers.get["X-B"] = "2";
  const auth: FaxiosHeaderValue | undefined = instance.defaults.headers.common["Authorization"];
  const timeout: number | undefined = instance.defaults.timeout;
  void auth;
  void timeout;

  // @ts-expect-error - a header bucket is an object of header values
  faxios.defaults.headers.common = 5;
  // @ts-expect-error - timeout is a number
  instance.defaults.timeout = "1000";
  // @ts-expect-error - headers must keep its buckets
  instance.defaults.headers = "x";
}

function typeGuardsNarrow(e: unknown): void {
  if (isFaxiosError(e)) {
    const code: string | undefined = e.code;
    const status: number | undefined = e.response?.status;
    const url: string | undefined = e.config?.url;
    // @ts-expect-error - response data is unknown without a type argument
    void e.response?.data.msg;
    void code;
    void status;
    void url;
  }

  if (isFaxiosError<{ msg: string; }>(e)) {
    const msg: string | undefined = e.response?.data.msg;
    void msg;
    // @ts-expect-error - msg is a string, not a number
    const wrong: number | undefined = e.response?.data.msg;
    void wrong;
  }

  if (faxios.isFaxiosError(e)) {
    const code: string | undefined = e.code;
    void code;
  }

  if (isCancel(e)) {
    const canceled: CanceledError = e;
    const message: string = e.message;
    void canceled;
    void message;
  }

  if (faxios.isCancel(e)) {
    const canceled: CanceledError = e;
    void canceled;
  }
}

function envFormDataAcceptsRuntimeConstructor(): void {
  faxios.create({ env: { FormData } });
  void faxios.get("/x", { env: { FormData } });
  class CustomFormData extends FormData {}
  faxios.create({ env: { FormData: CustomFormData } });
  faxios.create({ env: { FormData: null } });
  // @ts-expect-error - env.FormData must be a constructor, not a factory
  faxios.create({ env: { FormData: () => new FormData() } });
}

async function allSpreadAndFormToJSONAreTyped(): Promise<void> {
  // all() is Promise.all: a typed tuple, and plain values are allowed
  const [ a, b ] = await all([ faxios.get<number>("/a"), 1 ]);
  const n: number = a.data;
  const one: number = b;
  const viaStatic = await faxios.all([ Promise.resolve("x"), 2 ] as const);
  const sameTuple: Equal<typeof viaStatic, [string, 2]> = true;
  // spread() takes a callback with typed parameters and returns its result
  const pair = faxios.spread((x: FaxiosResponse, y: FaxiosResponse) => [ x.status, y.status ] as const);
  const statuses: readonly [number, number] = pair([ await faxios.get("/a"), await faxios.get("/b") ]);
  // formToJSON returns null for input it can't read
  const json: null | Record<string, unknown> = formToJSON(new FormData());
  const viaInstance: null | Record<string, unknown> = faxios.formToJSON(new FormData());
  // @ts-expect-error TS2322 -- data is a number
  const wrong: string = a.data;
  // @ts-expect-error TS2322 -- spread passes an array to the callback's parameters
  pair([ "not a response" ]);
  // @ts-expect-error TS2531 -- formToJSON can return null
  void formToJSON(new FormData()).key;
  void n;
  void one;
  void sameTuple;
  void statuses;
  void json;
  void viaInstance;
  void wrong;
}

function mergeConfigIsTyped(): void {
  const merged = mergeConfig({ timeout: 1 }, { baseURL: "https://api.example.com" });
  const timeout: number | undefined = merged.timeout;
  const viaStatic: FaxiosRequestConfig = faxios.mergeConfig(faxios.defaults, { timeout: 1 });
  // @ts-expect-error TS2322 -- timeout is a number
  mergeConfig({ timeout: "soon" });
  // @ts-expect-error TS2561 -- an unknown key is a typo, not a config field
  mergeConfig({ tiemout: 5 });
  // @ts-expect-error TS2339 -- the result has no open index signature
  void mergeConfig({}).whatever;
  void timeout;
  void viaStatic;
}

function headerInputsMatchRuntime(): void {
  // Headers, Maps and entry arrays are iterables of [name, value], which FaxiosHeaders reads
  const fromHeaders = new FaxiosHeaders(new Headers({ a: "b" }));
  const fromEntries = new FaxiosHeaders([[ "a", "b" ]]);
  fromHeaders.set(new Map([[ "x-a", "1" ]]));
  fromHeaders.set({ "X-A": "v", "X-B": [ "1", "2" ], "X-C": undefined }, true);
  void FaxiosHeaders.from(new Headers());
  void FaxiosHeaders.concat(fromEntries, new Headers(), [[ "c", "d" ]]);
  void faxios.get("/x", { headers: new Headers({ Accept: "application/json" }) });
  void faxios.get("/x", { headers: new Map([[ "Accept", "application/json" ]]) });
  // @ts-expect-error TS2769 -- a header value is a string, number, boolean, string array or null
  fromHeaders.set("X-A", { nested: 1 });
  // @ts-expect-error TS2769 -- with a header object the second argument is rewrite, a boolean
  fromHeaders.set({ "X-A": "v" }, () => true);
  // @ts-expect-error TS2353 -- header values in an object follow the same rule
  void new FaxiosHeaders({ "X-A": { nested: 1 } });
}

function errorCodesAreTyped(e: FaxiosError): void {
  const known: FaxiosErrorCode = FaxiosError.ERR_NETWORK;
  const code: FaxiosErrorCode | (string & {}) | undefined = e.code;
  const sameCode: Equal<typeof e.code, FaxiosErrorCode | (string & {}) | undefined> = true;
  // A plugin's own code is still a string
  const custom: string | undefined = e.code;
  if (e.code === ("ERR_NETWORK" satisfies FaxiosErrorCode)) void e;
  // @ts-expect-error TS1360 -- a misspelled known code is caught
  if (e.code === ("ERR_NETWROK" satisfies FaxiosErrorCode)) void e;
  // @ts-expect-error TS2820 -- not a known code
  const typo: FaxiosErrorCode = "ERR_NETWROK";
  void known;
  void code;
  void sameCode;
  void custom;
  void typo;
}

function httpStatusCodeIsLiteral(): void {
  const notFound: 404 = HttpStatusCode.NotFound;
  const name: "NotFound" = HttpStatusCode[404];
  const viaStatic: 200 = faxios.HttpStatusCode.Ok;
  // @ts-expect-error TS2322 -- NotFound is 404
  const wrong: 500 = HttpStatusCode.NotFound;
  // @ts-expect-error TS7053 -- no such status code
  void HttpStatusCode[499];
  void notFound;
  void name;
  void viaStatic;
  void wrong;
}

function fetchOptionsAreChecked(): void {
  void faxios.get("/x", { fetchOptions: { cache: "no-store", priority: "high", redirect: "follow" } });
  // Runtime extensions are passed through unchecked
  void faxios.get("/x", { fetchOptions: { dispatcher: {}, next: { revalidate: 60 }, cf: { cacheTtl: 5 } } });
  // @ts-expect-error TS2769 -- cache is one of the Fetch Standard's modes
  void faxios.get("/x", { fetchOptions: { cache: 42 } });
  // @ts-expect-error TS2769 -- priority is "auto", "high" or "low"
  void faxios.get("/x", { fetchOptions: { priority: "urgent" } });
}

void generics;
void headerAccessorsAreTyped;
void requestHeaderAccessorsMatchRuntime;
void headerRewriteIsBoolean;
void responseHeadersAreFaxiosHeaders;
void indexSignatureRemoved;
void requestBodyIsTyped;
void serializerAndEnvOptionsAreTyped;
void defaultsAreTyped;
void typeGuardsNarrow;
void envFormDataAcceptsRuntimeConstructor;
void allSpreadAndFormToJSONAreTyped;
void mergeConfigIsTyped;
void headerInputsMatchRuntime;
void errorCodesAreTyped;
void httpStatusCodeIsLiteral;
void fetchOptionsAreChecked;
