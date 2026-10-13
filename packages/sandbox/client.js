import faxios from "@gcmdev/faxios";

const URL = "http://127.0.0.1:3000/api";
const BODY = {
  foo: "bar",
  baz: 1234,
};

function handleSuccess(data) {
  console.log(data);
}
function handleFailure(data) {
  console.log("error", data);
}

// GET
faxios.get(URL, { params: BODY }).then(handleSuccess)
  .catch(handleFailure);

// POST
faxios.post(URL, BODY).then(handleSuccess)
  .catch(handleFailure);
