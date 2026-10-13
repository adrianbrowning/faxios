// faxios, retry stage: the validated endpoint on an instance with the retry plugin. The plugin's
// defaults are the policy the other two retry fixtures implement by hand.
import faxios from "faxios";
import { retry } from "faxios/plugins/retry";
import { userPathSchema, userQuerySchema, userSchema } from "../schemas.ts";
import type { RetryFixtureOptions, RetryGetUserInput, SendInput, SendResult } from "../types.ts";

export function createRetrying({ baseURL, fetch, retry: defaults = {} }: RetryFixtureOptions) {
  const api = faxios.create({ baseURL, ...(fetch && { env: { fetch } }) }).use(retry(defaults));
  const getUserEndpoint = api.define("get", "/users/{id}", {
    pathParamsSchema: userPathSchema,
    paramsSchema: userQuerySchema,
    responseSchema: userSchema,
  });

  async function send({ method, path, body, signal, retry: override }: SendInput): Promise<SendResult> {
    const response = await api.request<unknown>({
      method,
      url: path,
      ...(body && { data: body }),
      ...(signal && { signal }),
      ...(override !== undefined && { retry: override }),
    });
    return { status: response.status, data: response.data };
  }

  async function getUser({ path, query, signal, retry: override }: RetryGetUserInput) {
    const response = await getUserEndpoint({
      pathParams: path,
      params: query,
      ...(signal && { signal }),
      ...(override !== undefined && { retry: override }),
    });
    return response.data;
  }

  return { getUser, send };
}
