// Type-checked fixture for a consumer with exactOptionalPropertyTypes (see tsconfig.json next to
// this file). faxios treats an own `undefined` as unset, so passing `undefined` to an optional
// config field or header must compile.
import faxios, { create, FaxiosHeaders } from "faxios";
import type { FaxiosRequestConfig } from "faxios";
import { authBearer } from "faxios/plugins/auth-bearer";
import { forwardTo } from "faxios/plugins/forward-to";
import { retry } from "faxios/plugins/retry";

declare const maybeBoolean: boolean | undefined;
declare const maybeNumber: number | undefined;
declare const maybeString: string | undefined;

async function undefinedOptionals(): Promise<void> {
  await faxios.get("/user", { headers: { Authorization: undefined } });
  await faxios.get("/user", { headers: { "Content-Type": undefined } });
  await faxios.get("/user", { headers: { "X-Custom": maybeString } });
  await faxios.get("/user", { timeout: maybeNumber });
  await faxios.post("/user", { a: 1 }, { baseURL: maybeString, signal: undefined, timeout: maybeNumber });
  await faxios.request({ url: "/user", method: undefined, data: undefined, params: undefined });

  const config: FaxiosRequestConfig = { timeout: maybeNumber, withCredentials: undefined, headers: undefined };
  const instance = create({ timeout: maybeNumber, headers: { common: { Authorization: undefined } } });
  instance.defaults.timeout = maybeNumber;
  instance.defaults.headers.common["Authorization"] = undefined;
  const headers = new FaxiosHeaders({ Authorization: undefined });
  headers.set("Authorization", undefined);
  void config;
}

// Nested option objects take undefined too: transitional, the plugins' factory options and the
// per-request retry option.
async function undefinedNestedOptionals(): Promise<void> {
  await faxios.get("/user", { transitional: { clarifyTimeoutError: maybeBoolean, forcedJSONParsing: undefined } });
  const api = create({ transitional: { validateStatusUndefinedResolves: maybeBoolean } })
    .use(retry({ attempts: maybeNumber, attemptTimeout: undefined, jitter: undefined }))
    .use(authBearer(() => "token", { scheme: maybeString, header: undefined, overwrite: maybeBoolean }))
    .use(forwardTo("http://gateway.local/", { header: maybeString }));
  await api.get("/user", { retry: { attempts: maybeNumber }, forward: undefined });
}

void undefinedOptionals;
void undefinedNestedOptionals;
