import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create().use(retry());

const { data } = await api.get("/user", { headers: { Accept: "application/json" } });
