import { describe, expect, test } from "bun:test";

describe("Bun importing", () => {
  test("default export is callable", async () => {
    const { default: faxios } = await import("faxios");
    expect(typeof faxios).toBe("function");
  });

  test("named exports are present", async () => {
    const exports = (await import("faxios")) as Record<string, any>;

    expect(typeof (exports.faxios ?? exports.default)).toBe("function");
    expect(typeof (exports.create ?? exports.default.create)).toBe("function");
    expect(typeof exports.isCancel).toBe("function");
    expect(typeof exports.isFaxiosError).toBe("function");
    expect(typeof exports.VERSION).toBe("string");
  });
});
