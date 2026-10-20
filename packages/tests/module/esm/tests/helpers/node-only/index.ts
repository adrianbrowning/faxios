// Type-checked fixture for a Node-only consumer: no DOM lib, only @types/node, and skipLibCheck
// off (see tsconfig.json next to this file), so every shipped declaration file is checked. A
// DOM-only name in the declarations (BlobPart, BodyInit, ...) fails here with TS2304.
import faxios, { create, toFormData } from "faxios";
import type { FaxiosRequestConfig, FaxiosResponse, GenericAbortSignal } from "faxios";
import { definePlugin } from "faxios/plugins";
import { authBearer } from "faxios/plugins/auth-bearer";
import { authenticate } from "faxios/plugins/authenticate";
import { forwardTo } from "faxios/plugins/forward-to";
import { retry } from "faxios/plugins/retry";
import { timing } from "faxios/plugins/timing";
import buildFullPath from "faxios/unsafe/core/buildFullPath.js";
import buildURL from "faxios/unsafe/helpers/buildURL.js";
import combineURLs from "faxios/unsafe/helpers/combineURLs.js";
import isAbsoluteURL from "faxios/unsafe/helpers/isAbsoluteURL.js";

async function nodeConsumer(): Promise<void> {
  const config: FaxiosRequestConfig = {
    url: new URL("https://api.example.com/users"),
    params: new URLSearchParams({ page: "1" }),
    signal: AbortSignal.timeout(1000),
    env: { fetch, Request, Response, FormData },
    formSerializer: { Blob },
  };
  const response: FaxiosResponse = await faxios.request(config);
  const request: null | Request | undefined = response.request;
  const form: FormData = toFormData({ a: 1 });
  // Node's AbortSignal fits GenericAbortSignal on its own, not only through the config's union.
  const nodeSignal: GenericAbortSignal = AbortSignal.timeout(1000);

  const instance = create()
    .use(retry())
    .use(timing(event => void event))
    .use(authBearer(() => "t"))
    .use(authenticate(() => ({ query: { key: "k" } })))
    .use(forwardTo("https://gateway.example.com"));
  void instance;
  void definePlugin;
  void buildFullPath("/a", "https://example.com");
  void buildURL("/a");
  void combineURLs("https://example.com", "/a");
  void isAbsoluteURL("/a");
  void request;
  void form;
  void nodeSignal;
}

void nodeConsumer;
