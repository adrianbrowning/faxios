// The responses every runtime benchmark gets, from the in-memory fetch double and from the local
// server alike: a small fixed JSON user, and for ids starting "retry-", two 503s before it.
export const USER_BODY = JSON.stringify({
  id: "u1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  roles: [ "admin" ],
  createdAt: "2026-01-02T03:04:05.000Z",
});

export const FAILURES_BEFORE_SUCCESS = 2;

// Tracks how many times each retry id has failed. Returns the status to answer with.
export function createResponder() {
  const failures = new Map<string, number>();
  return (pathname: string): number => {
    const id = /^\/users\/(retry-[\w-]+)$/.exec(pathname)?.[1];
    if (id === undefined) return 200;
    const failed = failures.get(id) ?? 0;
    if (failed < FAILURES_BEFORE_SUCCESS) {
      failures.set(id, failed + 1);
      return 503;
    }
    failures.delete(id);
    return 200;
  };
}
