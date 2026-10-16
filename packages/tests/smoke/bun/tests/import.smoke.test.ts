import { describe, expect, test } from "bun:test";
import faxios, * as root from "faxios";
import { create, isCancel, isFaxiosError, VERSION } from "faxios";

describe("Bun importing", () => {
  test("default export is callable", () => {
    expect(typeof faxios).toBe("function");
  });

  test("named exports are present", () => {
    expect(typeof create).toBe("function");
    expect(typeof isCancel).toBe("function");
    expect(typeof isFaxiosError).toBe("function");
    expect(typeof VERSION).toBe("string");
    expect(isCancel).toBe(faxios.isCancel);
    expect(isFaxiosError).toBe(faxios.isFaxiosError);
  });

  // A removed or added root export changes the public API; update this list on purpose.
  test("the root entry exports exactly the published names", () => {
    expect(Object.keys(root).sort()).toEqual([
      "CanceledError",
      "Faxios",
      "FaxiosError",
      "FaxiosHeaders",
      "HttpStatusCode",
      "VERSION",
      "all",
      "assertSignal",
      "canceledFromSignal",
      "create",
      "default",
      "formToJSON",
      "hasOwnInPrototypeChain",
      "isCancel",
      "isFaxiosError",
      "isSchemaValidationError",
      "mergeConfig",
      "onAbort",
      "raceAbort",
      "resolveRequestURL",
      "stripUserInfo",
      "stripUserInfoInText",
      "toFormData",
    ]);
  });
});
