// @ts-nocheck
import assert from "assert";
import faxios, {
  CanceledError,
  AxiosError,
  AxiosHeaders,
  formToJSON,
  spread,
  isAxiosError,
  isCancel,
  all,
  toFormData,
} from "faxios";

assert.strictEqual(typeof faxios, "function");

assert.strictEqual(typeof CanceledError, "function");
assert.strictEqual(typeof AxiosError, "function");
assert.strictEqual(typeof AxiosHeaders, "function");
assert.strictEqual(typeof formToJSON, "function");
assert.strictEqual(typeof spread, "function");
assert.strictEqual(typeof isAxiosError, "function");
assert.strictEqual(typeof isCancel, "function");
assert.strictEqual(typeof all, "function");
assert.strictEqual(typeof toFormData, "function");

assert.strictEqual(typeof faxios.CanceledError, "function");
assert.strictEqual(typeof faxios.AxiosError, "function");
assert.strictEqual(typeof faxios.AxiosHeaders, "function");
assert.strictEqual(typeof faxios.formToJSON, "function");
assert.strictEqual(typeof faxios.spread, "function");
assert.strictEqual(typeof faxios.isAxiosError, "function");
assert.strictEqual(typeof faxios.isCancel, "function");
assert.strictEqual(typeof faxios.all, "function");
assert.strictEqual(typeof faxios.toFormData, "function");
