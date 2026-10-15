import assert from "node:assert";
import faxios, {
  all,
  CanceledError,
  FaxiosError,
  FaxiosHeaders,
  formToJSON,
  isCancel,
  isFaxiosError,
  mergeConfig,
  resolveRequestURL,
  toFormData
} from "faxios";

// The default export carries the same functions as the named exports.
assert.strictEqual(faxios.CanceledError, CanceledError);
assert.strictEqual(faxios.FaxiosError, FaxiosError);
assert.strictEqual(faxios.FaxiosHeaders, FaxiosHeaders);
assert.strictEqual(faxios.formToJSON, formToJSON);
assert.strictEqual(faxios.isFaxiosError, isFaxiosError);
assert.strictEqual(faxios.isCancel, isCancel);
assert.strictEqual(faxios.mergeConfig, mergeConfig);
assert.strictEqual(faxios.all, all);
assert.strictEqual(faxios.toFormData, toFormData);

// Errors and their guards
const error = new FaxiosError("boom", FaxiosError.ERR_BAD_REQUEST);
assert.ok(error instanceof Error);
assert.strictEqual(error.message, "boom");
assert.strictEqual(error.code, "ERR_BAD_REQUEST");
assert.strictEqual(isFaxiosError(error), true);
assert.strictEqual(isFaxiosError(new Error("boom")), false);
assert.strictEqual(isFaxiosError({ message: "boom" }), false);

const canceled = new CanceledError("stop");
assert.ok(canceled instanceof FaxiosError);
assert.strictEqual(canceled.code, "ERR_CANCELED");
assert.strictEqual(isCancel(canceled), true);
assert.strictEqual(isCancel(error), false);
assert.strictEqual(isFaxiosError(canceled), true);

// Headers are case-insensitive
const headers = new FaxiosHeaders({ "Content-Type": "application/json" });
assert.strictEqual(headers.get("content-type"), "application/json");
assert.strictEqual(headers.has("CONTENT-TYPE"), true);
// toJSON returns a null-prototype object
assert.deepStrictEqual({ ...headers.toJSON() }, { "Content-Type": "application/json" });

// mergeConfig: the second config wins, the first is left as it was
const base = { baseURL: "https://api.example.com", timeout: 1000 };
const merged = mergeConfig(base, { timeout: 5000, url: "/user" });
assert.strictEqual(merged.baseURL, "https://api.example.com");
assert.strictEqual(merged.timeout, 5000);
assert.strictEqual(merged.url, "/user");
assert.strictEqual(base.timeout, 1000);

// resolveRequestURL and getUri: baseURL + url + serialized params
const request = { baseURL: "https://api.example.com/", url: "/users/{id}", pathParams: { id: 7 }, params: { q: "a b" } };
assert.strictEqual(resolveRequestURL(request), "https://api.example.com/users/7?q=a+b");
assert.strictEqual(faxios.getUri(request), "https://api.example.com/users/7?q=a+b");

// toFormData and formToJSON round-trip a nested object
const form = toFormData({ user: { name: "Jane", tags: [ "a", "b" ] } }, new FormData());
assert.ok(form instanceof FormData);
assert.deepStrictEqual([ ...form.entries() ], [[ "user[name]", "Jane" ], [ "user[tags][0]", "a" ], [ "user[tags][1]", "b" ]]);
assert.strictEqual(JSON.stringify(formToJSON(form)), JSON.stringify({ user: { name: "Jane", tags: [ "a", "b" ] } }));
assert.ok(toFormData({ x: 1 }) instanceof FormData);

// all is Promise.all; spread hands an array to a function as its arguments
const values = await all([ Promise.resolve(1), 2 ]);
assert.deepStrictEqual(values, [ 1, 2 ]);
assert.strictEqual(faxios.spread((a: number, b: number) => a + b)([ 1, 2 ]), 3);

console.log("esm functions ok");
