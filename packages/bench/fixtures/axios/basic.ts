// Axios, basic stage: one JSON request; a non-2xx status rejects (Axios's default validateStatus).
import axios from "axios";
import type { FixtureOptions } from "../types.ts";

// `adapter: "fetch"` holds the transport constant across the three clients. The default adapter
// ("xhr" in browsers, "http" in Node) is only for the secondary measurement.
export function createBasic({ baseURL, fetch, adapter = "fetch" }: FixtureOptions & { adapter?: "fetch" | "http"; }) {
  const api = axios.create({ baseURL, adapter, ...(fetch && { env: { fetch } }) });
  return {
    async getUser(id: string): Promise<unknown> {
      const response = await api.get<unknown>(`/users/${encodeURIComponent(id)}`);
      return response.data;
    },
  };
}
