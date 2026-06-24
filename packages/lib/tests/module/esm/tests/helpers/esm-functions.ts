// @ts-nocheck
import assert from "assert";
import faxios, {
  CanceledError,
  FaxiosError,
  FaxiosHeaders,
  formToJSON,
  spread,
  isFaxiosError,
  isCancel,
  all,
  toFormData,
} from "faxios";

assert.strictEqual(typeof faxios, "function");

assert.strictEqual(typeof CanceledError, "function");
assert.strictEqual(typeof FaxiosError, "function");
assert.strictEqual(typeof FaxiosHeaders, "function");
assert.strictEqual(typeof formToJSON, "function");
assert.strictEqual(typeof spread, "function");
assert.strictEqual(typeof isFaxiosError, "function");
assert.strictEqual(typeof isCancel, "function");
assert.strictEqual(typeof all, "function");
assert.strictEqual(typeof toFormData, "function");

assert.strictEqual(typeof faxios.CanceledError, "function");
assert.strictEqual(typeof faxios.FaxiosError, "function");
assert.strictEqual(typeof faxios.FaxiosHeaders, "function");
assert.strictEqual(typeof faxios.formToJSON, "function");
assert.strictEqual(typeof faxios.spread, "function");
assert.strictEqual(typeof faxios.isFaxiosError, "function");
assert.strictEqual(typeof faxios.isCancel, "function");
assert.strictEqual(typeof faxios.all, "function");
assert.strictEqual(typeof faxios.toFormData, "function");
