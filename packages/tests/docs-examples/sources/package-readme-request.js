import faxios from "@gcmdev/faxios";

// Outside the browser a relative URL needs a baseURL.
const api = faxios.create({ baseURL: "https://example.test" });

const { data: user } = await api.get("/user", {
  params: { ID: 12345 },
  timeout: 5000,
});

const response = await api.post("/user", {
  firstName: "Fred",
  lastName: "Flintstone",
});
