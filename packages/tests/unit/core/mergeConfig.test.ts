import { describe, expect, it } from "vitest";
import { FaxiosHeaders } from "#src/index.js";
import mergeConfig, { mergeConfigExceptHeaders } from "#src/lib/core/mergeConfig.js";
import defaults from "#src/lib/defaults/index.js";

describe("core::mergeConfig", () => {
  it("accepts undefined for second argument", () => {
    expect(mergeConfig(defaults)).toEqual(defaults);
  });

  it("accepts an object for second argument", () => {
    expect(mergeConfig(defaults, {})).toEqual(defaults);
  });

  it("does not leave references", () => {
    const merged = mergeConfig(defaults, {});

    expect(merged).not.toBe(defaults);
    expect(merged.headers).not.toBe(defaults.headers);
  });

  it("allows setting request options", () => {
    const config = {
      url: "__sample url__",
      method: "__sample method__",
      params: "__sample params__",
      data: { foo: true },
    };
    const merged = mergeConfig(defaults, config);

    expect(merged.url).toBe(config.url);
    expect(merged.method).toBe(config.method);
    expect(merged.params).toBe(config.params);
    expect(merged.data).toEqual(config.data);
  });

  it("does not inherit request options", () => {
    const localDefaults = {
      method: "__sample method__",
      data: { foo: true },
    };
    const merged = mergeConfig(localDefaults, {});

    expect(merged.method).toBeUndefined();
    expect(merged.data).toBeUndefined();
  });

  for (const key of [ "auth", "headers", "params", "proxy" ]) {
    it(`sets new config for ${key} without default`, () => {
      const config1 = { [key]: undefined };
      const config2 = { [key]: { user: "foo", pass: "test" } };
      const expected = { [key]: { user: "foo", pass: "test" } };

      expect(mergeConfig(config1, config2)).toEqual(expected);
    });

    it(`merges ${key} with defaults`, () => {
      const config1 = { [key]: { user: "foo", pass: "bar" } };
      const config2 = { [key]: { pass: "test" } };
      const expected = { [key]: { user: "foo", pass: "test" } };

      expect(mergeConfig(config1, config2)).toEqual(expected);
    });

    it.each([ false, null, 123 ])(
      `overwrites default ${key} with %p`,
      value => {
        const config1 = { [key]: { user: "foo", pass: "test" } };
        const config2 = { [key]: value };
        const expected = { [key]: value };

        expect(mergeConfig(config1, config2)).toEqual(expected);
      }
    );
  }

  it("allows setting other options", () => {
    const merged = mergeConfig(defaults, { timeout: 123 });

    expect(merged.timeout).toBe(123);
  });

  it("allows setting custom options", () => {
    const merged = mergeConfig(defaults, { foo: "bar" });

    expect(merged.foo).toBe("bar");
  });

  it("allows setting custom default options", () => {
    const merged = mergeConfig({ foo: "bar" }, {});

    expect(merged.foo).toBe("bar");
  });

  it("allows merging custom objects in config", () => {
    const merged = mergeConfig(
      {
        nestedConfig: {
          propertyOnDefaultConfig: true,
        },
      },
      {
        nestedConfig: {
          propertyOnRequestConfig: true,
        },
      }
    );

    expect((merged.nestedConfig as Record<string, unknown>).propertyOnDefaultConfig).toBe(true);
    expect((merged.nestedConfig as Record<string, unknown>).propertyOnRequestConfig).toBe(true);
  });

  describe("headers", () => {
    it("allows merging with FaxiosHeaders instances", () => {
      const merged = mergeConfig(
        {
          headers: new FaxiosHeaders({
            x: 1,
            y: 2,
          }),
        },
        {
          headers: new FaxiosHeaders({
            X: 1,
            Y: 2,
          }),
        }
      );

      expect(merged.headers).toEqual({
        x: "1",
        y: "2",
      });
    });
  });

  describe("valueFromConfig2Keys", () => {
    const config1 = { url: "/foo", method: "post", data: { a: 3 } };

    it("skips if config2 does not define the key", () => {
      expect(mergeConfig(config1, {})).toEqual({});
    });

    it("passes a plain-object body by reference", () => {
      const data = { a: 1, b: 2 };
      const merged = mergeConfig(config1, { data });

      expect(merged.data).toBe(data);
    });

    it("passes an array body by reference", () => {
      const data = [ 1, 2, 3 ];
      const merged = mergeConfig(config1, { data });

      expect(merged.data).toBe(data);
    });

    it("sets config2 value directly for non-mergeable values", () => {
      const obj = Object.create({});

      expect(mergeConfig(config1, { data: 1 }).data).toBe(1);
      expect(mergeConfig(config1, { data: "str" }).data).toBe("str");
      expect(mergeConfig(config1, { data: obj }).data).toBe(obj);
      expect(mergeConfig(config1, { data: null }).data).toBe(null);
    });
  });

  describe("mergeDeepPropertiesKeys", () => {
    it("skips when both config1 and config2 values are undefined", () => {
      expect(
        mergeConfig({ headers: undefined }, { headers: undefined })
      ).toEqual({});
    });

    it("merges when both values are plain objects", () => {
      expect(
        mergeConfig({ headers: { a: 1, b: 1 } }, { headers: { b: 2, c: 2 } })
      ).toEqual({
        headers: { a: 1, b: 2, c: 2 },
      });
    });

    it("clones config2 when it is a plain object", () => {
      const config1 = { headers: [ 1, 2, 3 ] };
      const config2 = { headers: { a: 1, b: 2 } };
      const merged = mergeConfig(config1, config2);

      expect(merged.headers).toEqual(config2.headers);
      expect(merged.headers).not.toBe(config2.headers);
    });

    it("clones config2 when it is an array", () => {
      const config1 = { headers: { a: 1, b: 1 } };
      const config2 = { headers: [ 1, 2, 3 ] };
      const merged = mergeConfig(config1, config2);

      expect(merged.headers).toEqual(config2.headers);
      expect(merged.headers).not.toBe(config2.headers);
    });

    it("sets config2 value directly for non-mergeable values", () => {
      const config1 = { headers: { a: 1, b: 1 } };
      const obj = Object.create({});

      expect(mergeConfig(config1, { headers: 1 }).headers).toBe(1);
      expect(mergeConfig(config1, { headers: "str" }).headers).toBe("str");
      expect(mergeConfig(config1, { headers: obj }).headers).toBe(obj);
      expect(mergeConfig(config1, { headers: null }).headers).toBe(null);
    });

    it("clones config1 when it is a plain object", () => {
      const config1 = { headers: { a: 1, b: 2 } };
      const merged = mergeConfig(config1, {});

      expect(merged.headers).toEqual(config1.headers);
      expect(merged.headers).not.toBe(config1.headers);
    });

    it("clones config1 when it is an array", () => {
      const config1 = { headers: [ 1, 2, 3 ] };
      const merged = mergeConfig(config1, {});

      expect(merged.headers).toEqual(config1.headers);
      expect(merged.headers).not.toBe(config1.headers);
    });

    it("sets config1 value directly for non-mergeable values", () => {
      const obj = Object.create({});

      expect(mergeConfig({ headers: 1 }, {}).headers).toBe(1);
      expect(mergeConfig({ headers: "str" }, {}).headers).toBe("str");
      expect(mergeConfig({ headers: obj }, {}).headers).toBe(obj);
      expect(mergeConfig({ headers: null }, {}).headers).toBe(null);
    });
  });

  describe("defaultToConfig2Keys", () => {
    it("skips when both config1 and config2 values are undefined", () => {
      expect(
        mergeConfig(
          { transformRequest: undefined },
          { transformRequest: undefined }
        )
      ).toEqual({});
    });

    // Deliberate: an own explicit `undefined` in config2 overrides config1's
    // value rather than falling back to it. The merged result drops the key
    // (its value is undefined) instead of inheriting "FROM-DEFAULT".
    it("lets an explicit undefined in config2 win over config1's value", () => {
      const merged = mergeConfig(
        { xsrfCookieName: "FROM-DEFAULT" },
        { xsrfCookieName: undefined }
      );

      expect(merged.xsrfCookieName).toBe(undefined);
    });

    it("clones config2 when both values are plain objects", () => {
      const config1 = { transformRequest: { a: 1, b: 1 } };
      const config2 = { transformRequest: { b: 2, c: 2 } };
      const merged = mergeConfig(config1, config2);

      expect(merged.transformRequest).toEqual(config2.transformRequest);
      expect(merged.transformRequest).not.toBe(config2.transformRequest);
    });

    it("clones config2 when it is an array", () => {
      const config1 = { transformRequest: { a: 1, b: 1 } };
      const config2 = { transformRequest: [ 1, 2, 3 ] };
      const merged = mergeConfig(config1, config2);

      expect(merged.transformRequest).toEqual(config2.transformRequest);
      expect(merged.transformRequest).not.toBe(config2.transformRequest);
    });

    it("sets config2 value directly for non-mergeable values", () => {
      const config1 = { transformRequest: { a: 1, b: 1 } };
      const obj = Object.create({});

      expect(
        mergeConfig(config1, { transformRequest: 1 }).transformRequest
      ).toBe(1);
      expect(
        mergeConfig(config1, { transformRequest: "str" }).transformRequest
      ).toBe("str");
      expect(
        mergeConfig(config1, { transformRequest: obj }).transformRequest
      ).toBe(obj);
      expect(
        mergeConfig(config1, { transformRequest: null }).transformRequest
      ).toBe(null);
    });

    it("clones config1 when it is a plain object", () => {
      const config1 = { transformRequest: { a: 1, b: 2 } };
      const merged = mergeConfig(config1, {});

      expect(merged.transformRequest).toEqual(config1.transformRequest);
      expect(merged.transformRequest).not.toBe(config1.transformRequest);
    });

    it("clones config1 when it is an array", () => {
      const config1 = { transformRequest: [ 1, 2, 3 ] };
      const merged = mergeConfig(config1, {});

      expect(merged.transformRequest).toEqual(config1.transformRequest);
      expect(merged.transformRequest).not.toBe(config1.transformRequest);
    });

    it("sets config1 value directly for non-mergeable values", () => {
      const obj = Object.create({});

      expect(mergeConfig({ transformRequest: 1 }, {}).transformRequest).toBe(1);
      expect(
        mergeConfig({ transformRequest: "str" }, {}).transformRequest
      ).toBe("str");
      expect(mergeConfig({ transformRequest: obj }, {}).transformRequest).toBe(
        obj
      );
      expect(mergeConfig({ transformRequest: null }, {}).transformRequest).toBe(
        null
      );
    });
  });

  describe("responseSchema", () => {
    const schemaA = { "~standard": { version: 1 as const, vendor: "a", validate: (v: unknown) => ({ value: v }) } };
    const schemaB = { "~standard": { version: 1 as const, vendor: "b", validate: (v: unknown) => ({ value: v }) } };

    it("uses config2 schema when config1 has none", () => {
      const merged = mergeConfig({}, { responseSchema: schemaB });
      expect((merged as Record<string, unknown>).responseSchema).toStrictEqual(schemaB);
    });

    it("uses config1 schema when config2 has none", () => {
      const merged = mergeConfig({ responseSchema: schemaA }, {});
      expect((merged as Record<string, unknown>).responseSchema).toStrictEqual(schemaA);
    });

    it("config2 wins when both have responseSchema", () => {
      const merged = mergeConfig({ responseSchema: schemaA }, { responseSchema: schemaB });
      expect((merged as Record<string, unknown>).responseSchema).toStrictEqual(schemaB);
    });

    it("explicit undefined in config2 keeps config1's schema", () => {
      const merged = mergeConfig({ responseSchema: schemaA }, { responseSchema: undefined });
      expect((merged as Record<string, unknown>).responseSchema).toStrictEqual(schemaA);
    });
  });

  describe("one level deep", () => {
    it("replaces a nested params value instead of merging it", () => {
      const merged = mergeConfig({ params: { filter: { status: "open" }, page: 1 } }, { params: { filter: { owner: "me" } } });

      expect({ ...merged.params as object }).toEqual({ filter: { owner: "me" }, page: 1 });
    });
  });

  describe("mergeConfigExceptHeaders", () => {
    it("merges every key but headers", () => {
      const merged = mergeConfigExceptHeaders({ headers: { "X-A": "a" }, timeout: 1 }, { headers: { "X-B": "b" }, baseURL: "http://x.test" });

      expect(Object.hasOwn(merged, "headers")).toBe(false);
      expect(merged.timeout).toBe(1);
      expect(merged.baseURL).toBe("http://x.test");
    });
  });

  describe("redact", () => {
    it("adds config2's keys to config1's, lower-cased and deduplicated", () => {
      const merged = mergeConfig({ redact: [ "X-Api-Key", "token" ] }, { redact: [ "Password", "TOKEN" ] });

      expect(merged.redact).toEqual([ "x-api-key", "token", "password" ]);
    });

    it("keeps config1's keys when config2 has none", () => {
      expect(mergeConfig({ redact: [ "X-Api-Key" ] }, {}).redact).toEqual([ "x-api-key" ]);
    });

    it("leaves redact unset when neither config has it", () => {
      expect(mergeConfig({}, {})).not.toHaveProperty("redact");
    });
  });

  describe("directMergeKeys", () => {
    it("merges when config2 defines the key", () => {
      expect(mergeConfig({}, { validateStatus: undefined })).toEqual({
        validateStatus: undefined,
      });
    });

    it("merges when both values are plain objects", () => {
      expect(
        mergeConfig(
          { validateStatus: { a: 1, b: 1 } },
          { validateStatus: { b: 2, c: 2 } }
        )
      ).toEqual({ validateStatus: { a: 1, b: 2, c: 2 } });
    });

    it("clones config2 when it is a plain object", () => {
      const config1 = { validateStatus: [ 1, 2, 3 ] };
      const config2 = { validateStatus: { a: 1, b: 2 } };
      const merged = mergeConfig(config1, config2);

      expect(merged.validateStatus).toEqual(config2.validateStatus);
      expect(merged.validateStatus).not.toBe(config2.validateStatus);
    });

    it("clones config2 when it is an array", () => {
      const config1 = { validateStatus: { a: 1, b: 2 } };
      const config2 = { validateStatus: [ 1, 2, 3 ] };
      const merged = mergeConfig(config1, config2);

      expect(merged.validateStatus).toEqual(config2.validateStatus);
      expect(merged.validateStatus).not.toBe(config2.validateStatus);
    });

    it("sets config2 value directly for non-mergeable values", () => {
      const config1 = { validateStatus: { a: 1, b: 2 } };
      const obj = Object.create({});

      expect(mergeConfig(config1, { validateStatus: 1 }).validateStatus).toBe(
        1
      );
      expect(
        mergeConfig(config1, { validateStatus: "str" }).validateStatus
      ).toBe("str");
      expect(mergeConfig(config1, { validateStatus: obj }).validateStatus).toBe(
        obj
      );
      expect(
        mergeConfig(config1, { validateStatus: null }).validateStatus
      ).toBe(null);
    });

    it("clones config1 when it is a plain object", () => {
      const config1 = { validateStatus: { a: 1, b: 2 } };
      const merged = mergeConfig(config1, {});

      expect(merged.validateStatus).toEqual(config1.validateStatus);
      expect(merged.validateStatus).not.toBe(config1.validateStatus);
    });

    it("clones config1 when it is an array", () => {
      const config1 = { validateStatus: [ 1, 2, 3 ] };
      const merged = mergeConfig(config1, {});

      expect(merged.validateStatus).toEqual(config1.validateStatus);
      expect(merged.validateStatus).not.toBe(config1.validateStatus);
    });

    it("sets config1 value directly for non-mergeable values", () => {
      const obj = Object.create({});

      expect(mergeConfig({ validateStatus: 1 }, {}).validateStatus).toBe(1);
      expect(mergeConfig({ validateStatus: "str" }, {}).validateStatus).toBe(
        "str"
      );
      expect(mergeConfig({ validateStatus: obj }, {}).validateStatus).toBe(obj);
      expect(mergeConfig({ validateStatus: null }, {}).validateStatus).toBe(
        null
      );
    });

    it("falls back to config1's validator for an explicit undefined by default", () => {
      expect(
        mergeConfig(defaults, { validateStatus: undefined }).validateStatus
      ).toBe(defaults.validateStatus);
    });

    it("keeps an explicit undefined when validateStatusUndefinedResolves opts in", () => {
      expect(
        mergeConfig(defaults, {
          validateStatus: undefined,
          transitional: { validateStatusUndefinedResolves: true },
        }).validateStatus
      ).toBeUndefined();
    });

    it("keeps config1 value when the transitional option is disabled (issue #6688)", () => {
      const validateStatus = () => false;

      expect(
        mergeConfig(
          { validateStatus },
          {
            validateStatus: undefined,
            transitional: { validateStatusUndefinedResolves: false },
          }
        ).validateStatus
      ).toBe(validateStatus);

      expect(
        mergeConfig(defaults, { validateStatus: null }).validateStatus
      ).toBe(null);
    });
  });
});

describe("core::mergeConfig key collection (#296)", () => {
  it("reads each config value once", () => {
    let reads = 0;
    const config1 = {};
    Object.defineProperty(config1, "timeout", {
      enumerable: true,
      get() {
        reads++;
        return 5;
      },
    });

    const merged = mergeConfig(config1, { url: "/a" });

    expect(merged.timeout).toBe(5);
    expect(merged.url).toBe("/a");
    expect(reads).toBe(1);
  });

  it("keeps config1's key order, then config2's new keys", () => {
    const merged = mergeConfig({ timeout: 1, baseURL: "/a" }, { method: "post", timeout: 2 });

    expect(Object.keys(merged)).toEqual([ "timeout", "baseURL", "method" ]);
  });
});
