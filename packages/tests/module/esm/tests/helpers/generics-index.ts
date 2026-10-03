// Type-checked fixture (NO @ts-nocheck) guarding the public type surface:
// - <T, R, D> generics on request methods
// - request-body D typing
// - removal of the FaxiosInstance catch-all index signature
// - typed FaxiosHeaders accessors (no longer `unknown`)
// - serializer maxDepth and nullable env.Request/env.Response
// - instance defaults typed as header buckets plus request config
import faxios, { FaxiosHeaders } from "faxios";
import type { FaxiosHeaderValue, FaxiosResponse } from "faxios";

type User = { id: number; name: string; };

async function generics(): Promise<void> {
  // T threads to response data
  const r1 = await faxios.post<User>("/user", { name: "a" });
  const id: number = r1.data.id;
  const name: string = r1.data.name;
  void id;
  void name;

  // D types the request body; R wraps the response
  const r2 = await faxios.request<User, FaxiosResponse<User>, { q: string; }>({
    url: "/user",
    data: { q: "search" },
  });
  void r2.data.id;

  // R can override the resolved shape entirely
  const r3: string = await faxios.get<User, string>("/user");
  void r3;
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

function indexSignatureRemoved(): void {
  // @ts-expect-error - FaxiosInstance no longer has a catch-all index signature
  faxios.thisMemberDoesNotExist;
}

function requestBodyIsTyped(): void {
  // @ts-expect-error - body must match D ({ name: string })
  void faxios.post<User, FaxiosResponse<User>, { name: string; }>("/user", { wrong: 1 });
}

function serializerAndEnvOptionsAreTyped(): void {
  faxios.create({
    formSerializer: { maxDepth: 10 },
    paramsSerializer: { maxDepth: Infinity },
    env: { fetch: globalThis.fetch, Request: null, Response: null },
  });
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

void generics;
void headerAccessorsAreTyped;
void indexSignatureRemoved;
void requestBodyIsTyped;
void serializerAndEnvOptionsAreTyped;
void defaultsAreTyped;
