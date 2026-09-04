import vm from "node:vm";
import { describe, it, expect } from "vitest";
import utils from "#src/lib/utils.js";

describe("utils::isX", () => {
  it("should validate Array", () => {
    expect(utils.isArray([])).toEqual(true);
    expect(utils.isArray({ length: 5 })).toEqual(false);
  });

  it("should validate ArrayBuffer", () => {
    expect(utils.isArrayBuffer(new ArrayBuffer(2))).toEqual(true);
    expect(utils.isArrayBuffer({})).toEqual(false);
  });

  it("should validate ArrayBufferView", () => {
    expect(utils.isArrayBufferView(new DataView(new ArrayBuffer(2)))).toEqual(
      true
    );
  });

  it("should validate FormData", () => {
    expect(utils.isFormData(new FormData())).toEqual(true);
  });

  it("should validate Blob", () => {
    expect(utils.isBlob(new Blob())).toEqual(true);
  });

  it("should validate String", () => {
    expect(utils.isString("")).toEqual(true);
    expect(
      utils.isString({
        toString: function () {
          return "";
        },
      })
    ).toEqual(false);
  });

  it("should validate Number", () => {
    expect(utils.isNumber(123)).toEqual(true);
    expect(utils.isNumber("123")).toEqual(false);
  });

  it("should validate Undefined", () => {
    expect(utils.isUndefined(undefined)).toEqual(true);
    expect(utils.isUndefined(null)).toEqual(false);
  });

  it("should validate Object", () => {
    expect(utils.isObject({})).toEqual(true);
    expect(utils.isObject([])).toEqual(true);
    expect(utils.isObject(null)).toEqual(false);
  });

  it("should validate plain Object", () => {
    expect(utils.isPlainObject({})).toEqual(true);
    expect(utils.isPlainObject([])).toEqual(false);
    expect(utils.isPlainObject(null)).toEqual(false);
    expect(utils.isPlainObject(Object.create({}))).toEqual(false);
  });

  it("should ignore inherited symbol properties when validating plain Object", () => {
    const proto = Object.prototype as Record<symbol, unknown>;
    try {
      proto[Symbol.iterator] = function* () {
        yield [ "x-injected", "yes" ];
      };
      proto[Symbol.toStringTag] = "Custom";

      expect(utils.isPlainObject({})).toEqual(true);
      expect(utils.isPlainObject([])).toEqual(false);
      expect(
        utils.isPlainObject({
          [Symbol.iterator]: function* () {
            yield [ "x-own", "yes" ];
          },
        })
      ).toEqual(false);
      expect(
        utils.isPlainObject({
          [Symbol.toStringTag]: "Custom",
        })
      ).toEqual(false);
    }
    finally {
      delete proto[Symbol.iterator];
      delete proto[Symbol.toStringTag];
    }
  });

  it("should not treat an iterator inherited from a terminal template as iterable", () => {
    // A terminal (null-prototype) template is indistinguishable from an attacker
    // handing over `Object.create(gadgetTemplate)`, so its members are not
    // trusted: the object reads as a plain object and is NOT safely iterable.
    // Consequence of that call: such an object is never iterated as entries.
    const proto = Object.create(null);
    proto[Symbol.iterator] = function* () {
      yield [ "x", "1" ];
    };

    const victim = Object.create(proto);

    expect(utils.isPlainObject(victim)).toEqual(true);
    expect(utils.isSafeIterable(victim)).toEqual(false);
  });

  it("should still treat an iterator inherited from a class as iterable", () => {
    class RealIterable {
      *[Symbol.iterator]() {
        yield [ "x", "1" ];
      }
    }

    expect(utils.isSafeIterable(new RealIterable())).toEqual(true);
    expect(utils.isPlainObject(new RealIterable())).toEqual(false);
  });

  it("should not read polluted Object.prototype iterator accessors for safe iterable checks", () => {
    let accessed = false;

    try {
      Object.defineProperty(Object.prototype, Symbol.iterator, {
        configurable: true,
        get() {
          accessed = true;
          throw new Error("polluted iterator accessor");
        },
      });

      expect(utils.isSafeIterable({})).toEqual(false);
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

    expect(utils.hasOwnInPrototypeChain(proxy, "missing")).toEqual(false);
    expect(utils.getSafeProp(proxy, "missing")).toEqual(undefined);
    expect(calls).toBeLessThanOrEqual(2);
  });

  it("should not honor a polluted cross-realm Object.prototype", () => {
    // A foreign realm's Object.prototype is exactly as pollutable as ours, and it
    // is not `=== Object.prototype`, so an identity check against the current
    // realm lets the gadget through.
    const foreign = vm.runInNewContext("({ ObjectPrototype: Object.prototype, make: () => ({}) })") as {
      ObjectPrototype: Record<string, unknown>;
      make: () => object;
    };

    try {
      foreign.ObjectPrototype["polluted"] = "gadget";
      const victim = foreign.make();

      expect((victim as Record<string, unknown>)["polluted"]).toEqual("gadget");
      expect(utils.hasOwnInPrototypeChain(victim, "polluted")).toEqual(false);
      expect(utils.getSafeProp(victim, "polluted")).toEqual(undefined);
    }
    finally {
      delete foreign.ObjectPrototype["polluted"];
    }
  });

  it("should not honor members inherited from a terminal template object", () => {
    // An attacker who can hand over `Object.create(template)` controls everything
    // the template exposes. Only the object's own properties are trusted.
    const template = Object.create(null) as Record<string, unknown>;
    template["visitor"] = () => "gadget";

    const victim = Object.create(template) as Record<string, unknown>;

    expect(utils.hasOwnInPrototypeChain(victim, "visitor")).toEqual(false);
    expect(utils.getSafeProp(victim, "visitor")).toEqual(undefined);
  });

  it("should still honor own properties of a null-prototype object", () => {
    // The boundary applies to INHERITED terminal objects, not to the object under
    // inspection: mergeConfig hands null-prototype configs straight to these reads.
    const config = Object.create(null) as Record<string, unknown>;
    config["method"] = "post";

    expect(utils.hasOwnInPrototypeChain(config, "method")).toEqual(true);
    expect(utils.getSafeProp(config, "method")).toEqual("post");
  });

  it("should still honor members inherited from a class instance", () => {
    class Template {
      describe(): string { return "real"; }
    }

    expect(utils.hasOwnInPrototypeChain(new Template(), "describe")).toEqual(true);
    expect(typeof utils.getSafeProp(new Template(), "describe")).toEqual("function");
  });

  describe("toSafeFlatObject", () => {
    it("should return a writable null-prototype object by identity", () => {
      // Identity matters: dispatchRequest mutates the config it is handed and
      // callers observe those mutations, so a safe input must not be copied.
      const config = Object.create(null) as Record<string, unknown>;
      config["method"] = "get";

      expect(utils.toSafeFlatObject(config)).toBe(config);
    });

    it("should pass non-objects straight through", () => {
      expect(utils.toSafeFlatObject("str")).toEqual("str");
      expect(utils.toSafeFlatObject(null)).toEqual(null);
      expect(utils.toSafeFlatObject(undefined)).toEqual(undefined);
    });

    it("should flatten a plain object away from Object.prototype", () => {
      const ObjProto = Object.prototype as Record<string, unknown>;

      try {
        ObjProto["redirect"] = "manual";
        const flat = utils.toSafeFlatObject({ method: "get" }) as Record<string, unknown>;

        expect(Object.getPrototypeOf(flat)).toEqual(null);
        expect(flat["method"]).toEqual("get");
        expect(flat["redirect"]).toEqual(undefined);
      }
      finally {
        delete ObjProto["redirect"];
      }
    });

    it("should carry own inherited members down from a class instance", () => {
      class Config {
        method = "post";
        get timeout(): number { return 42; }
      }

      const flat = utils.toSafeFlatObject(new Config()) as Record<string, unknown>;

      expect(Object.getPrototypeOf(flat)).toEqual(null);
      expect(flat["method"]).toEqual("post");
      expect(flat["timeout"]).toEqual(42);
    });

    it("should never carry __proto__, constructor or prototype", () => {
      const source = { method: "get", constructor: "gadget", prototype: "gadget" };

      const flat = utils.toSafeFlatObject(source) as Record<string, unknown>;

      expect(Object.getPrototypeOf(flat)).toEqual(null);
      expect(flat["method"]).toEqual("get");
      expect(Object.hasOwn(flat, "constructor")).toEqual(false);
      expect(Object.hasOwn(flat, "prototype")).toEqual(false);
    });

    it("should copy a frozen object rather than hand back an immutable one", () => {
      // Callers mutate the result; a frozen input must not be returned by identity.
      const frozen = Object.freeze(Object.assign(Object.create(null), { method: "get" }));

      const flat = utils.toSafeFlatObject(frozen) as Record<string, unknown>;

      expect(flat).not.toBe(frozen);
      expect(Object.isExtensible(flat)).toEqual(true);
      expect(flat["method"]).toEqual("get");
    });

    it("should terminate on a cyclic Proxy prototype", () => {
      let calls = 0;
      let proxy: object;
      proxy = new Proxy(
        { method: "get" },
        {
          getPrototypeOf() {
            calls += 1;
            if (calls > 5) throw new Error("cycled");
            return proxy;
          },
        }
      );

      expect((utils.toSafeFlatObject(proxy) as Record<string, unknown>)["method"]).toEqual("get");
    });
  });

  it("should validate Date", () => {
    expect(utils.isDate(new Date())).toEqual(true);
    expect(utils.isDate(Date.now())).toEqual(false);
  });

  it("should validate Function", () => {
    expect(utils.isFunction(function () {})).toEqual(true);
    expect(utils.isFunction("function")).toEqual(false);
  });

  it("should validate URLSearchParams", () => {
    expect(utils.isURLSearchParams(new URLSearchParams())).toEqual(true);
    expect(utils.isURLSearchParams("foo=1&bar=2")).toEqual(false);
  });

  it("should validate TypedArray instance", () => {
    expect(utils.isTypedArray(new Uint8Array([ 1, 2, 3 ]))).toEqual(true);
    expect(utils.isTypedArray([ 1, 2, 3 ])).toEqual(false);
  });
});
