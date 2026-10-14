import faxios from "@gcmdev/faxios";

const { data, status } = await faxios.get("https://api.example.com/users/1");
console.log(status, data);
