/* eslint-disable no-prototype-builtins */
import assert from "node:assert";
import { describe, it } from "vitest";
import mergeConfig from "#src/lib/core/mergeConfig.js";
import defaults from "#src/lib/defaults/index.js";
import { assertClean, ObjProto, restorePrototypeAfterEach } from "../../setup/pollution.js";

describe("Prototype Pollution Protection", () => {
  restorePrototypeAfterEach();

  describe("mergeConfig", () => {
    it("should filter dangerous keys at top level", () => {
      const result = assertClean(mergeConfig(
        {},
        JSON.parse("{\"__proto__\": {\"polluted\": \"yes\"}, \"constructor\": {\"polluted\": \"yes\"}, \"prototype\": {\"polluted\": \"yes\"}, \"url\": \"/api/test\"}")
      ), null);

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(result.url, "/api/test");
      assert.strictEqual(Object.hasOwn(result, "constructor"), false);
      assert.strictEqual(Object.hasOwn(result, "prototype"), false);
    });

    it("should filter dangerous keys in headers", () => {
      const result = assertClean(mergeConfig(
        {},
        JSON.parse("{\"headers\": {\"__proto__\": {\"polluted\": \"yes\"}, \"Content-Type\": \"application/json\"}}")
      ), null);
      const headers = assertClean(result.headers);

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(headers["Content-Type"], "application/json");
    });

    it("should filter dangerous keys in custom config properties", () => {
      const result = assertClean(mergeConfig(
        {},
        JSON.parse("{\"customProp\": {\"__proto__\": {\"polluted\": \"yes\"}, \"safe\": \"value\"}}")
      ), null);
      const customProp = assertClean(result.customProp);

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(customProp.safe, "value");
    });

    it("should still merge configs correctly", () => {
      const config1 = {
        baseURL: "https://api.example.com",
        timeout: 1000,
        headers: {
          common: {
            Accept: "application/json",
          },
        },
      };

      const config2 = {
        url: "/users",
        timeout: 5000,
        headers: {
          common: {
            "Content-Type": "application/json",
          },
        },
      };

      const result: any = mergeConfig(config1, config2);

      assert.strictEqual(result.baseURL, "https://api.example.com");
      assert.strictEqual(result.url, "/users");
      assert.strictEqual(result.timeout, 5000);
      assert.strictEqual(result.headers.common.Accept, "application/json");
      assert.strictEqual(
        result.headers.common["Content-Type"],
        "application/json"
      );
    });

    // Polluted transformRequest/Response must not
    // replace the safe defaults through inherited reads during merge.
    it("should not inherit polluted transformRequest from Object.prototype", () => {
      const polluted = () => "attacker";
      ObjProto.transformRequest = polluted;

      const result = mergeConfig(
        { transformRequest: [ d => d ] },
        { url: "/x" }
      );

      assert.notStrictEqual(result.transformRequest, polluted);
      assert.ok(Array.isArray(result.transformRequest));
    });

    it("should not inherit polluted transformResponse from Object.prototype", () => {
      const polluted = () => "attacker";
      ObjProto.transformResponse = polluted;

      const result = mergeConfig(
        { transformResponse: [ d => d ] },
        { url: "/x" }
      );

      assert.notStrictEqual(result.transformResponse, polluted);
      assert.ok(Array.isArray(result.transformResponse));
    });
  });

  // mergeDirectKeys must not inherit validateStatus from
  // Object.prototype (was using the `in` operator which traverses the chain).
  describe("validateStatus merge", () => {
    it("should not inherit a polluted validateStatus during mergeConfig", () => {
      ObjProto.validateStatus = () => true;

      const merged = mergeConfig(defaults, { url: "/x" });

      assert.strictEqual(merged.validateStatus, defaults.validateStatus);
    });
  });

  // Structural defense: mergeConfig returns a null-prototype object, so any
  // property read that is not an own property of config cannot inherit from
  // Object.prototype. Adding a new key to Object.prototype must never appear
  // as a property of the merged config.
  describe("mergeConfig null-prototype structural defense", () => {
    it("should return an object whose prototype is null", () => {
      const merged = mergeConfig({ url: "/x" }, { method: "get" });
      assert.strictEqual(Object.getPrototypeOf(merged), null);
    });

    it("should preserve hasOwnProperty as a callable own slot", () => {
      const merged = mergeConfig({}, { url: "/x", method: "get" });
      assert.strictEqual(typeof merged.hasOwnProperty, "function");
      assert.strictEqual(merged.hasOwnProperty("url"), true);
      assert.strictEqual(merged.hasOwnProperty("method"), true);
      assert.strictEqual(merged.hasOwnProperty("bogus"), false);
    });

    it("should not serialize hasOwnProperty slot via Object.keys", () => {
      const merged = mergeConfig({ url: "/x" }, {});
      assert.ok(!Object.keys(merged).includes("hasOwnProperty"));
    });

    it("should not expose arbitrary polluted keys as inherited properties", () => {
      // eslint-disable-next-line no-extend-native -- prototype-pollution test; restored after each test
      Object.prototype.polluted = "attacker";
      const merged = mergeConfig({ url: "/x" }, {});
      assert.strictEqual(merged.polluted, undefined);
    });
  });

  // Verify every gadget enumerated in the audit
  // is neutralized end-to-end by the null-prototype config.
  describe("Full gadget coverage via null-prototype config", () => {
    it("should ignore polluted timeout at the merged config level", () => {
      ObjProto.timeout = 1;
      const merged = mergeConfig({}, { url: "/x" });
      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(merged, "timeout"),
        false
      );
      assert.strictEqual(merged.timeout, undefined);
    });
  });

  // Object.defineProperty calls a HasProperty check on `get`/`set` of the
  // descriptor. A polluted Object.prototype.get with a non-function value would
  // throw TypeError at every defineProperty site that uses a plain literal
  // descriptor. Each fixed site should be shielded with `__proto__: null`.
  describe("Object.defineProperty descriptor literals", () => {
    it("should not throw in mergeConfig when Object.prototype.get is polluted", () => {
      ObjProto.get = "attacker";

      const result = mergeConfig({}, { url: "/x", method: "get" });

      assert.strictEqual(result.url, "/x");
      assert.strictEqual(result.method, "get");
      assert.strictEqual(typeof result.hasOwnProperty, "function");
    });
  });

  // #177: payload keys named like prototype members are caller data, not config, so they reach the wire.
  // #178: no RequestInit member, env constructor, toFormData option or default-instance field is
  // read through Object.prototype.
  describe("payload keys and inherited request reads", () => {
    it("passes the request body to the transport by reference", () => {
      const data = { constructor: "Bob" };
      assert.strictEqual(mergeConfig({}, { data }).data, data);
    });
  });
});
