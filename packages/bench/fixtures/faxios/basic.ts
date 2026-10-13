// faxios, basic stage: one JSON request; a non-2xx status rejects (faxios's default validateStatus).
import faxios from "faxios";
import type { FixtureOptions } from "../types.ts";

export function createBasic({ baseURL, fetch }: FixtureOptions) {
  const api = faxios.create({ baseURL, ...(fetch && { env: { fetch } }) });
  return {
    async getUser(id: string): Promise<unknown> {
      const response = await api.get<unknown>(`/users/${encodeURIComponent(id)}`);
      return response.data;
    },
  };
}
