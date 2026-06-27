import { describe, it, expect } from "vitest";
import utils from "#src/lib/utils.js";

const { extend } = utils;

describe("utils::extend", () => {
  it("should be mutable", () => {
    const a: Record<string, unknown> = {};
    const b = { foo: 123 };

    extend(a, b, undefined);

    expect(a.foo).toEqual(b.foo);
  });

  it("should extend properties", () => {
    let a: Record<string, unknown> = { foo: 123, bar: 456 };
    const b = { bar: 789 };

    a = extend(a, b, undefined);

    expect(a.foo).toEqual(123);
    expect(a.bar).toEqual(789);
  });

  it("should bind to thisArg", () => {
    const a: Record<string, unknown> = {};
    const b = {
      getFoo: function getFoo(): unknown {
        return (this as unknown as { foo: unknown; }).foo;
      },
    };
    const thisArg = { foo: "barbaz" };

    extend(a, b, thisArg);

    expect(typeof a.getFoo).toEqual("function");
    expect((a.getFoo as () => unknown)()).toEqual(thisArg.foo);
  });
});
