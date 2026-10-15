import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://example.test" }).use(retry());

const { data } = await api.get("/user", { headers: { Accept: "application/json" } });
