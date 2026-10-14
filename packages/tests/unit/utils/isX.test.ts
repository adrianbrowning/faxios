import { describe, expect, it } from "vitest";
import { getSafeProp, hasOwnInPrototypeChain, isArray, isArrayBuffer, isArrayBufferView, isBlob, isDate, isFormData, isFunction, isNumber, isObject, isPlainObject, isSafeIterable, isString, isTypedArray, isUndefined, isURLSearchParams } from "#src/lib/utils.js";

describe("utils::isX", () => {
  it("should validate Array", () => {
    expect(isArray([])).toEqual(true);
    expect(isArray({ length: 5 })).toEqual(false);
  });

  it("should validate ArrayBuffer", () => {
    expect(isArrayBuffer(new ArrayBuffer(2))).toEqual(true);
    expect(isArrayBuffer({})).toEqual(false);
  });

  it("should validate ArrayBufferView", () => {
    expect(isArrayBufferView(new DataView(new ArrayBuffer(2)))).toEqual(
      true
    );
  });

  it("should validate FormData", () => {
    expect(isFormData(new FormData())).toEqual(true);
  });

  it("should validate Blob", () => {
    expect(isBlob(new Blob())).toEqual(true);
  });

  it("should validate String", () => {
    expect(isString("")).toEqual(true);
    expect(
      isString({
        toString: function () {
          return "";
        },
      })
    ).toEqual(false);
  });

  it("should validate Number", () => {
    expect(isNumber(123)).toEqual(true);
    expect(isNumber("123")).toEqual(false);
  });

  it("should validate Undefined", () => {
    expect(isUndefined(undefined)).toEqual(true);
    expect(isUndefined(null)).toEqual(false);
  });

  it("should validate Object", () => {
    expect(isObject({})).toEqual(true);
    expect(isObject([])).toEqual(true);
    expect(isObject(null)).toEqual(false);
  });

  it("should validate plain Object", () => {
    expect(isPlainObject({})).toEqual(true);
    expect(isPlainObject([])).toEqual(false);
    expect(isPlainObject(null)).toEqual(false);
    expect(isPlainObject(Object.create({}))).toEqual(false);
  });

  it("should ignore inherited symbol properties when validating plain Object", () => {
    const proto = Object.prototype as Record<symbol, unknown>;
    try {
      proto[Symbol.iterator] = function* () {
        yield [ "x-injected", "yes" ];
      };
      proto[Symbol.toStringTag] = "Custom";

      expect(isPlainObject({})).toEqual(true);
      expect(isPlainObject([])).toEqual(false);
      expect(
        isPlainObject({
          [Symbol.iterator]: function* () {
            yield [ "x-own", "yes" ];
          },
        })
      ).toEqual(false);
      expect(
        isPlainObject({
          [Symbol.toStringTag]: "Custom",
        })
      ).toEqual(false);
    }
    finally {
      delete proto[Symbol.iterator];
      delete proto[Symbol.toStringTag];
    }
  });

  it("should treat an object with a genuinely inherited iterator as non-plain", () => {
    // Iterator inherited from a custom (non-Object.prototype) source: this is a
    // real iterable, not prototype pollution, so it must not be classified plain.
    const proto = Object.create(null);
    proto[Symbol.iterator] = function* () {
      yield [ "x", "1" ];
    };

    expect(isPlainObject(Object.create(proto))).toEqual(false);
  });

  it("should not read polluted Object.prototype iterator accessors for safe iterable checks", () => {
    let accessed = false;

    try {
      // eslint-disable-next-line no-extend-native -- prototype-pollution test; removed in finally
      Object.defineProperty(Object.prototype, Symbol.iterator, {
        configurable: true,
        get() {
          accessed = true;
          throw new Error("polluted iterator accessor");
        },
      });

      expect(isSafeIterable({})).toEqual(false);
      expect(accessed).toEqual(false);
    }
    finally {
      delete (Object.prototype as Record<symbol, unknown>)[Symbol.iterator];
    }
  });

  it("should stop safe prototype-chain reads on cyclic Proxy prototypes", () => {
    let calls = 0;
    let proxy: object;
    proxy = new Proxy(
      {},
      {
        getPrototypeOf() {
          calls += 1;
          if (calls > 5) {
            throw new Error("cycled");
          }
          return proxy;
        },
      }
    );

    expect(hasOwnInPrototypeChain(proxy, "missing")).toEqual(false);
    expect(getSafeProp(proxy, "missing")).toEqual(undefined);
    expect(calls).toBeLessThanOrEqual(2);
  });

  it("should validate Date", () => {
    expect(isDate(new Date())).toEqual(true);
    expect(isDate(Date.now())).toEqual(false);
  });

  it("should validate Function", () => {
    expect(isFunction(function () {})).toEqual(true);
    expect(isFunction("function")).toEqual(false);
  });

  it("should validate URLSearchParams", () => {
    expect(isURLSearchParams(new URLSearchParams())).toEqual(true);
    expect(isURLSearchParams("foo=1&bar=2")).toEqual(false);
  });

  it("should validate TypedArray instance", () => {
    expect(isTypedArray(new Uint8Array([ 1, 2, 3 ]))).toEqual(true);
    expect(isTypedArray([ 1, 2, 3 ])).toEqual(false);
  });
});
