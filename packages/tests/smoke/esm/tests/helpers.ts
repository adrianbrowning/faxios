import type http from "node:http";
import type { AddressInfo } from "node:net";

export type FetchInput = Request | string | URL;
export type MockFetch = (input: FetchInput, init?: RequestInit) => Promise<Response>;

export const toRequest = (input: FetchInput, init?: RequestInit): Request =>
  input instanceof Request ? input : new Request(input, init);

/** A fetch that never settles on its own: it rejects with the signal's reason once aborted. */
export const pendingFetch: MockFetch = async (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) { reject(signal.reason); return; }
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });

export const serverPort = (server: http.Server): number => (server.address() as AddressInfo).port;

export type FetchCall = { init: RequestInit; input: Request; };

/** Records every call (input normalised to a Request) and answers with `body` as JSON (default `{"ok":true}`). */
export const createRecordingFetch = (body: string = JSON.stringify({ ok: true })) => {
  const calls: Array<FetchCall> = [];
  const mockFetch: MockFetch = async (input, init) => {
    calls.push({ input: toRequest(input, init), init: init ?? {} });
    return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { mockFetch, getCalls: () => calls };
};
