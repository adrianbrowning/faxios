import assert from "node:assert";
import { describe, it } from "vitest";
import prepareRequest from "#src/lib/core/prepareRequest.js";
import { ObjProto, restorePrototypeAfterEach } from "../../setup/pollution.js";

describe("Prototype Pollution Protection", () => {
  restorePrototypeAfterEach();

  describe("prepareRequest params and paramsSerializer gadget", () => {
    it("should not inherit polluted params via prepareRequest", () => {
      ObjProto.params = { injected: "yes" };

      const resolved = prepareRequest({ url: "/api", method: "get" });

      assert.ok(
        resolved.url!.indexOf("injected") === -1,
        "polluted params must not appear in URL"
      );
      assert.strictEqual(resolved.url, "/api", "URL must remain unchanged");
    });

    it("should not invoke polluted paramsSerializer via prepareRequest", () => {
      let serializerInvoked = false;
      ObjProto.paramsSerializer = function polluted() {
        serializerInvoked = true;
        return "injected=yes";
      };

      const resolved = prepareRequest({
        url: "/api",
        method: "get",
        params: { legit: "true" },
      });

      assert.strictEqual(
        serializerInvoked,
        false,
        "polluted paramsSerializer must not be called"
      );
      // The URL should have legit param serialized normally
      assert.ok(
        resolved.url!.indexOf("legit=true") !== -1,
        "legitimate params must still be serialized"
      );
    });
  });

  // cloneConfig uses Object.defineProperty with a descriptor object.
  // If Object.prototype.get is polluted with a function, a plain {} descriptor
  // would result in a mixed accessor+data descriptor and throw a TypeError.
  // The descriptor must be null-prototyped to be immune.
  describe("cloneConfig Object.defineProperty descriptor pollution", () => {
    it("should not throw when Object.prototype.get is polluted", () => {
      ObjProto.get = function polluted() { return "attacker"; };

      // prepareRequest calls cloneConfig internally — this must not throw
      assert.doesNotThrow(() => {
        prepareRequest({ url: "/api", method: "get" });
      }, "cloneConfig must not throw when Object.prototype.get is polluted");
    });
  });
});
