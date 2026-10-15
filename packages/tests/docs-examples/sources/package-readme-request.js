import faxios from "@gcmdev/faxios";

const { data: user } = await faxios.get("/user", {
  params: { ID: 12345 },
  timeout: 5000,
});

const response = await faxios.post("/user", {
  firstName: "Fred",
  lastName: "Flintstone",
});
