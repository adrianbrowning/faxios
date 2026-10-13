// The retry policy contract. Every client must pass every case: the faxios retry plugin's defaults,
// the hand-written Fetch helper and the Axios interceptor implement the same policy.
// Timing cases replace globalThis.fetch with a scripted double and drive a fake clock; the success
// sequence and the attempt bound run against a local server.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GetUserInput } from "../fixtures/schemas.ts";
import type { RetryOverride, SendInput } from "../fixtures/types.ts";
import { clients, outcome } from "./clients.ts";
import { startServer, USER_PARSED, USER_WIRE } from "./server.ts";

const VALID: GetUserInput = { path: { id: "u1" }, query: { fields: "summary", limit: 10 } };
const BASE_URL = "http://bench.test";

type Step = (() => Response) | "hang" | Error;
type Call = { body: string | null; method: string; url: string; };

const json = (status: number, body: unknown = { status }, headers: Record<string, string> = {}) => () =>
  Response.json(body, { status, headers });
const ok = json(200, USER_WIRE);

// Answers each call with the next step; the last step repeats. "hang" waits for the request's
// signal and rejects with its reason, as fetch does.
function stubFetch(steps: Array<Step>): Array<Call> {
  const calls: Array<Call> = [];
  vi.stubGlobal("fetch", async (input: Request | URL | string, init?: RequestInit) => {
    const request = new Request(input, init);
    const call: Call = { method: request.method, url: request.url, body: null };
    calls.push(call);
    call.body = request.body ? await request.text() : null;
    const step = steps[Math.min(calls.length, steps.length) - 1]!;
    if (step instanceof Error) throw step;
    if (step !== "hang") return step();
    const { promise, reject } = Promise.withResolvers<Response>();
    request.signal.addEventListener("abort", () => reject(request.signal.reason as Error), { once: true });
    return promise;
  });
  return calls;
}

// Lets fetch bodies and promise chains run without moving the fake clock.
async function settle() {
  for (let i = 0; i < 20; i++) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setImmediate(resolve);
    // eslint-disable-next-line no-await-in-loop -- one turn at a time
    await promise;
  }
}

// A zero wait fires 1ms later on the fake clock, as setTimeout(0) does in Node, so a delay of 0
// takes advance(1) per retry.
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await settle();
}

describe.each(clients)("$name retry policy", client => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: [ "setTimeout", "clearTimeout", "Date" ] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const getUser = (retry?: RetryOverride, signal?: AbortSignal, defaults = {}) =>
    outcome(client, client.createRetrying({ baseURL: BASE_URL, retry: defaults }).getUser({ ...VALID, retry, signal }));

  const send = (input: SendInput, defaults = {}) =>
    outcome(client, client.createRetrying({ baseURL: BASE_URL, retry: defaults }).send(input));

  describe("against a local server", () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    it("answers two retryable failures then a valid response with exactly three attempts", async () => {
      // Retry-After: 0 keeps the waits at zero without changing the policy.
      const server = await startServer((_request, index) =>
        (index < 2 ? { status: 503, headers: { "retry-after": "0" } } : { status: 200, body: USER_WIRE }));
      try {
        const api = client.createRetrying({ baseURL: server.baseURL });
        await expect(outcome(client, api.getUser(VALID))).resolves.toEqual({ value: USER_PARSED });
        expect(server.requests.map(r => r.url)).toEqual(Array(3).fill("/users/u1?fields=summary&limit=10"));
      }
      finally {
        await server.close();
      }
    });

    it("stops after three total attempts, counting the first", async () => {
      const server = await startServer(() => ({ status: 503, headers: { "retry-after": "0" } }));
      try {
        const api = client.createRetrying({ baseURL: server.baseURL });
        await expect(outcome(client, api.getUser(VALID))).resolves.toEqual({ kind: "status:503" });
        expect(server.requests).toHaveLength(3);
      }
      finally {
        await server.close();
      }
    });
  });

  describe("backoff", () => {
    it("waits 100ms then 200ms without jitter", async () => {
      const calls = stubFetch([ json(503), json(503), ok ]);
      const result = getUser({ jitter: "none" });
      await advance(99);
      expect(calls).toHaveLength(1);
      await advance(1);
      expect(calls).toHaveLength(2);
      await advance(199);
      expect(calls).toHaveLength(2);
      await advance(1);
      await expect(result).resolves.toEqual({ value: USER_PARSED });
      expect(calls).toHaveLength(3);
    });

    it("applies full jitter by default: a random share of the capped backoff", async () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const calls = stubFetch([ json(503), json(503), ok ]);
      const result = getUser();
      await advance(49);
      expect(calls).toHaveLength(1);
      await advance(1);
      expect(calls).toHaveLength(2);
      await advance(99);
      expect(calls).toHaveLength(2);
      await advance(1);
      await expect(result).resolves.toEqual({ value: USER_PARSED });
    });

    it("caps the backoff at 30 seconds", async () => {
      const calls = stubFetch([ json(503), ok ]);
      const result = getUser({ delay: 60_000, jitter: "none" });
      await advance(29_999);
      expect(calls).toHaveLength(1);
      await advance(1);
      await expect(result).resolves.toEqual({ value: USER_PARSED });
      expect(calls).toHaveLength(2);
    });
  });

  describe("Retry-After", () => {
    it("waits the delay-seconds of a 429, without jitter", async () => {
      const calls = stubFetch([ json(429, {}, { "retry-after": "2" }), ok ]);
      const result = getUser();
      await advance(1999);
      expect(calls).toHaveLength(1);
      await advance(1);
      await expect(result).resolves.toEqual({ value: USER_PARSED });
    });

    it("waits until the HTTP date of a 503", async () => {
      vi.setSystemTime(new Date("2026-03-04T05:06:07Z"));
      const calls = stubFetch([ json(503, {}, { "retry-after": new Date(Date.now() + 3000).toUTCString() }), ok ]);
      const result = getUser();
      await advance(2999);
      expect(calls).toHaveLength(1);
      await advance(1);
      await expect(result).resolves.toEqual({ value: USER_PARSED });
    });

    it("rejects without retrying when Retry-After exceeds 300 seconds", async () => {
      const calls = stubFetch([ json(429, {}, { "retry-after": "301" }), ok ]);
      const result = getUser();
      await settle();
      await expect(result).resolves.toEqual({ kind: "status:429" });
      expect(calls).toHaveLength(1);
    });

    it("waits the computed backoff when respectRetryAfter is false", async () => {
      const calls = stubFetch([ json(429, {}, { "retry-after": "60" }), ok ]);
      const result = getUser({ respectRetryAfter: false, jitter: "none" });
      await advance(100);
      await expect(result).resolves.toEqual({ value: USER_PARSED });
      expect(calls).toHaveLength(2);
    });
  });

  describe("what is retried", () => {
    it.each([ 408, 429, 500, 502, 503, 504 ])("retries a %i", async status => {
      const calls = stubFetch([ json(status), ok ]);
      const result = getUser({ delay: 0 });
      await advance(1);
      await expect(result).resolves.toEqual({ value: USER_PARSED });
      expect(calls).toHaveLength(2);
    });

    it.each([ 400, 404, 501, 505 ])("does not retry a %i", async status => {
      const calls = stubFetch([ json(status), ok ]);
      const result = getUser({ delay: 0 });
      await advance(1);
      await expect(result).resolves.toEqual({ kind: `status:${status}` });
      expect(calls).toHaveLength(1);
    });

    it("retries a network error", async () => {
      const calls = stubFetch([ new TypeError("fetch failed"), ok ]);
      const result = getUser({ delay: 0 });
      await advance(1);
      await expect(result).resolves.toEqual({ value: USER_PARSED });
      expect(calls).toHaveLength(2);
    });

    it("retries an attempt that times out", async () => {
      const calls = stubFetch([ "hang", ok ]);
      const result = getUser({ attemptTimeout: 50, delay: 0 });
      await advance(49);
      expect(calls).toHaveLength(1);
      await advance(1);
      await advance(1);
      await expect(result).resolves.toEqual({ value: USER_PARSED });
      expect(calls).toHaveLength(2);
    });

    it("rejects with a timeout once every attempt has timed out", async () => {
      const calls = stubFetch([ "hang" ]);
      const result = getUser({ attempts: 2, attemptTimeout: 50, delay: 0 });
      await advance(50);
      await advance(1);
      await advance(50);
      await expect(result).resolves.toEqual({ kind: "timeout" });
      expect(calls).toHaveLength(2);
    });

    it("does not retry a response that fails the response schema", async () => {
      const calls = stubFetch([ json(200, { ...USER_WIRE, email: "nope" }), ok ]);
      const result = getUser({ delay: 0 });
      await advance(1);
      await expect(result).resolves.toEqual({ kind: "response-schema" });
      expect(calls).toHaveLength(1);
    });
  });

  describe("methods and bodies", () => {
    it.each([ "post", "patch" ] as const)("does not retry %s by default", async method => {
      const calls = stubFetch([ json(503), json(201) ]);
      const result = send({ method, path: "/users", body: { name: "Ada" }, retry: { delay: 0 } });
      await advance(1);
      await expect(result).resolves.toEqual({ kind: "status:503" });
      expect(calls).toHaveLength(1);
    });

    it.each([ "put", "delete" ] as const)("retries %s by default", async method => {
      const calls = stubFetch([ json(503), json(503), json(200) ]);
      const result = send({ method, path: "/users/u1", retry: { delay: 0 } });
      await advance(1);
      await advance(1);
      await expect(result).resolves.toEqual({ value: { status: 200, data: { status: 200 } } });
      expect(calls.map(c => c.method)).toEqual(Array(3).fill(method.toUpperCase()));
    });

    it("retries POST once it is listed in methods, sending the same JSON body each time", async () => {
      const calls = stubFetch([ json(503), json(201) ]);
      const result = send({ method: "post", path: "/users", body: { name: "Ada" }, retry: { delay: 0, methods: [ "post" ] } });
      await advance(1);
      await expect(result).resolves.toEqual({ value: { status: 201, data: { status: 201 } } });
      expect(calls.map(c => JSON.parse(c.body ?? "null") as unknown)).toEqual([ { name: "Ada" }, { name: "Ada" } ]);
    });

    it("does not replay a stream body the first attempt consumed", async () => {
      const calls = stubFetch([ json(503), json(200) ]);
      const body = new Blob([ "avatar-bytes" ]).stream();
      const result = send({ method: "put", path: "/users/u1/avatar", body, retry: { delay: 0 } });
      await advance(1);
      await expect(result).resolves.toEqual({ kind: "status:503" });
      expect(calls).toEqual([ { method: "PUT", url: `${BASE_URL}/users/u1/avatar`, body: "avatar-bytes" } ]);
    });
  });

  describe("cancellation", () => {
    it("never retries a canceled attempt", async () => {
      const calls = stubFetch([ "hang", ok ]);
      const controller = new AbortController();
      const result = getUser(undefined, controller.signal);
      await settle();
      controller.abort();
      await settle();
      await expect(result).resolves.toEqual({ kind: "canceled" });
      await advance(10_000);
      expect(calls).toHaveLength(1);
    });

    it("settles at once and sends nothing more when canceled during a wait", async () => {
      const calls = stubFetch([ json(503), ok ]);
      const controller = new AbortController();
      const result = getUser({ jitter: "none" }, controller.signal);
      await advance(50);
      controller.abort();
      await settle();
      await expect(result).resolves.toEqual({ kind: "canceled" });
      await advance(10_000);
      expect(calls).toHaveLength(1);
    });
  });

  describe("per-request control", () => {
    it("sends one attempt with retry: false", async () => {
      const calls = stubFetch([ json(503), ok ]);
      const result = getUser(false);
      await advance(1000);
      await expect(result).resolves.toEqual({ kind: "status:503" });
      expect(calls).toHaveLength(1);
    });

    it("uses the client's policy when the request has no override", async () => {
      const calls = stubFetch([ json(503) ]);
      const result = getUser(undefined, undefined, { attempts: 2, delay: 0 });
      await advance(1);
      await expect(result).resolves.toEqual({ kind: "status:503" });
      expect(calls).toHaveLength(2);
    });

    it("lets a request's options take precedence over the client's, field by field", async () => {
      const calls = stubFetch([ json(503) ]);
      const result = getUser({ attempts: 4 }, undefined, { attempts: 2, delay: 0 });
      await advance(1);
      await advance(1);
      await advance(1);
      await expect(result).resolves.toEqual({ kind: "status:503" });
      expect(calls).toHaveLength(4);
    });
  });
});
