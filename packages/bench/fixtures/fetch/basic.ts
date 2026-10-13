// Native Fetch, basic stage: one JSON request; a non-2xx status rejects.
import type { FixtureOptions } from "../types.ts";

export class HttpError extends Error {
  readonly status: number;

  constructor(response: Response) {
    super(`Request failed with status ${response.status}`);
    this.name = "HttpError";
    this.status = response.status;
  }
}

export function createBasic({ baseURL, fetch = globalThis.fetch }: FixtureOptions) {
  return {
    async getUser(id: string): Promise<unknown> {
      const response = await fetch(`${baseURL}/users/${encodeURIComponent(id)}`, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new HttpError(response);
      }
      return response.json();
    },
  };
}
