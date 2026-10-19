// Type-checked fixture for a consumer with neither the DOM lib nor @types/node (see tsconfig.json
// next to this file), skipLibCheck off: every shipped declaration must compile against the
// faxios web shims alone. A name only the DOM lib or @types/node declares fails here with TS2304.
// The source itself uses no fetch-API globals, since this setup has none.
import faxios, { create, FaxiosError, FaxiosHeaders, isCancel, toFormData } from "faxios";
import type { FaxiosRequestConfig, GenericFormData } from "faxios";
import { definePlugin } from "faxios/plugins";
import { authBearer } from "faxios/plugins/auth-bearer";
import { authenticate } from "faxios/plugins/authenticate";
import { forwardTo } from "faxios/plugins/forward-to";
import { retry } from "faxios/plugins/retry";
import { timing } from "faxios/plugins/timing";
import buildFullPath from "faxios/unsafe/core/buildFullPath.js";

async function bareConsumer(form: GenericFormData): Promise<void> {
  const config = {
    url: "/users",
    baseURL: "https://api.example.com",
    params: { page: 1 },
    headers: { Accept: "application/json" },
    timeout: 1000,
  } satisfies FaxiosRequestConfig;
  const response = await faxios.get<{ id: number; }>("/users/1", config);
  const id: number = response.data.id;
  const headers = new FaxiosHeaders({ "X-Test": "1" });
  const filled: GenericFormData = toFormData({ a: 1 }, form);

  const instance = create()
    .use(retry())
    .use(timing(event => void event))
    .use(authBearer(() => "t"))
    .use(authenticate(() => ({ query: { key: "k" } })))
    .use(forwardTo("https://gateway.example.com"));
  void instance;
  void definePlugin;
  void buildFullPath("/a", "https://example.com");
  void id;
  void headers;
  void filled;
  void isCancel;
  void FaxiosError;
}

void bareConsumer;
