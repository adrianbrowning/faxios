// ponytail: single fetch boundary mock for browser tests
import { vi } from "vitest";

export const jsonResponse = (body: unknown = {}, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    statusText: "OK",
    headers: { "Content-Type": "application/json" },
    ...init,
  });

type ResponseSpec = {
  status?: number;
  statusText?: string;
  body?: BodyInit | null;
  headers?: HeadersInit;
};

export type FetchMockController = {
  readonly lastRequest: Request | undefined;
  readonly requests: Array<Request>;
  fetch: ReturnType<typeof vi.fn>;
  respondWith: (init: ResponseSpec) => void;
  failNetworkError: () => void;
  [Symbol.dispose]: () => void;
};

export const installFetchMock = (
  options?: { defaultResponse?: ResponseInit & { body?: BodyInit; }; }
): FetchMockController => {
  const originalFetch = globalThis.fetch;
  const requests: Array<Request> = [];
  let lastRequest: Request | undefined;
  let networkError = false;
  let spec: ResponseSpec = options?.defaultResponse
    ? {
      status: options.defaultResponse.status,
      statusText: options.defaultResponse.statusText,
      body: options.defaultResponse.body ?? null,
      headers: options.defaultResponse.headers,
    }
    : {};

  const buildResponse = (): Response => {
    if (spec.status == null && spec.body == null && spec.headers == null) {
      return jsonResponse({});
    }
    return new Response(spec.body ?? null, {
      status: spec.status ?? 200,
      statusText: spec.statusText ?? "OK",
      headers: spec.headers,
    });
  };

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    requests.push(req);
    lastRequest = req;

    if (networkError) {
      throw new TypeError("Failed to fetch");
    }

    const signal = init?.signal;
    if (signal?.aborted) {
      throw signal.reason;
    }

    if (signal) {
      // Defer success so an abort dispatched after send (but before the
      // response settles) wins the race and rejects with signal.reason.
      return new Promise<Response>((resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(signal.reason),
          { once: true }
        );
        setTimeout(() => resolve(buildResponse()), 0);
      });
    }

    return buildResponse();
  });

  globalThis.fetch = fetch;

  return {
    get lastRequest() {
      return lastRequest;
    },
    get requests() {
      return requests;
    },
    fetch,
    respondWith(init: ResponseSpec) {
      spec = init;
    },
    failNetworkError() {
      networkError = true;
    },
    [Symbol.dispose]() {
      globalThis.fetch = originalFetch;
    },
  };
};
