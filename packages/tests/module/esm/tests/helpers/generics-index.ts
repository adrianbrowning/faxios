// Type-checked fixture (NO @ts-nocheck) guarding the public type surface:
// - <T, R, D> generics on request methods
// - request-body D typing
// - removal of the FaxiosInstance catch-all index signature
// - typed FaxiosHeaders accessors (no longer `unknown`)
import faxios, { FaxiosHeaders } from "faxios";
import type { FaxiosResponse } from "faxios";

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

void generics;
void headerAccessorsAreTyped;
void indexSignatureRemoved;
void requestBodyIsTyped;
