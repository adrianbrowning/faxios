import assert from "node:assert";
import { afterEach, beforeEach } from "vitest";

// ponytail: only augment Object.prototype with non-conflicting test-only keys.
// All faxios config keys overlap with FaxiosRequestConfig and are accessed via ObjProto.
declare global {
  interface Object {
    customNested?: unknown;
    polluted?: unknown;
  }
}

const proto = Object.prototype;

/** `Object.prototype` as a plain record, so tests can plant any key on it. */
export const ObjProto = proto as Record<string, unknown>;

/** Asserts `value` is an object with the expected prototype that did not pick up `polluted`. */
export const assertClean = (value: unknown, expectedProto: null | object = proto): Record<string, unknown> => {
  assert.ok(typeof value === "object" && value !== null, "expected an object");
  assert.strictEqual(Object.getPrototypeOf(value), expectedProto);
  assert.strictEqual(Reflect.get(value, "polluted"), undefined);
  assert.strictEqual(Object.hasOwn(value, "__proto__"), false);
  return value as Record<string, unknown>;
};

/**
 * Snapshots `Object.prototype` before each test and puts it back afterwards: keys a test added
 * are deleted and keys it replaced or removed get their original descriptor again. Vitest runs
 * `afterEach` even when the test throws, so a failing pollution test can't leak into the next one.
 */
export const restorePrototypeAfterEach = (): void => {
  let snapshot = new Map<PropertyKey, PropertyDescriptor>();

  beforeEach(() => {
    snapshot = new Map(Reflect.ownKeys(proto).map(key => [ key, Reflect.getOwnPropertyDescriptor(proto, key)! ]));
  });

  afterEach(() => {
    for (const key of Reflect.ownKeys(proto)) {
      if (!snapshot.has(key)) Reflect.deleteProperty(proto, key);
    }
    for (const [ key, descriptor ] of snapshot) {
      Reflect.defineProperty(proto, key, descriptor);
    }
  });
};
