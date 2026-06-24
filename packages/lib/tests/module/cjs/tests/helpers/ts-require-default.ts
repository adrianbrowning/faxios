// @ts-nocheck
const assert = require('assert');
const axios = require('axios').default;
const {
  CanceledError,
  FaxiosError,
  FaxiosHeaders,
  formToJSON,
  spread,
  isFaxiosError,
  isCancel,
  all,
  toFormData,
} = axios;

assert.strictEqual(typeof axios, 'function');

assert.strictEqual(typeof CanceledError, 'function');
assert.strictEqual(typeof FaxiosError, 'function');
assert.strictEqual(typeof FaxiosHeaders, 'function');
assert.strictEqual(typeof formToJSON, 'function');
assert.strictEqual(typeof spread, 'function');
assert.strictEqual(typeof isFaxiosError, 'function');
assert.strictEqual(typeof isCancel, 'function');
assert.strictEqual(typeof all, 'function');
assert.strictEqual(typeof toFormData, 'function');

assert.strictEqual(typeof axios.CanceledError, 'function');
assert.strictEqual(typeof axios.FaxiosError, 'function');
assert.strictEqual(typeof axios.FaxiosHeaders, 'function');
assert.strictEqual(typeof axios.formToJSON, 'function');
assert.strictEqual(typeof axios.spread, 'function');
assert.strictEqual(typeof axios.isFaxiosError, 'function');
assert.strictEqual(typeof axios.isCancel, 'function');
assert.strictEqual(typeof axios.all, 'function');
assert.strictEqual(typeof axios.toFormData, 'function');
