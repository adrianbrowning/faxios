// Shared by the Deno smoke tests. Mock fetches take the same arguments as faxios's `env.fetch`.
export type FetchInput = Request | string | URL;
export type MockFetch = (input: FetchInput, init?: RequestInit) => Promise<Response>;

export const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), { status: 200, ...init, headers: { "Content-Type": "application/json" } });

/** Records every call (input normalised to a Request) and answers with `body` as JSON. */
export const createRecordingFetch = (body: unknown = { ok: true }) => {
  const calls: Array<Request> = [];
  const fetch: MockFetch = async (input, init) => {
    calls.push(new Request(input, init));
    return jsonResponse(body);
  };
  return { fetch, calls };
};
