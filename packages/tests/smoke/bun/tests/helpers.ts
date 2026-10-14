// Shared by the Bun smoke tests. Mock fetches take the same arguments as faxios's `env.fetch`.
export type FetchInput = Request | string | URL;
export type MockFetch = (input: FetchInput, init?: RequestInit) => Promise<Response>;

// Bun's `Request` constructor types take a string or a Request, not a URL.
export const toRequest = (input: FetchInput, init?: RequestInit): Request =>
  input instanceof Request ? input : new Request(String(input), init);

export const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), { status: 200, ...init, headers: { "Content-Type": "application/json" } });

/** Records every call (input normalised to a Request) and answers with `body` as JSON. */
export const createRecordingFetch = (body: unknown = { ok: true }) => {
  const calls: Array<Request> = [];
  const fetch: MockFetch = async (input, init) => {
    calls.push(toRequest(input, init));
    return jsonResponse(body);
  };
  return { fetch, calls };
};
