import { describe, it, expect } from "vitest";
import faxios, { FaxiosError, AxiosHeaders } from "faxios";

describe("faxios ESM module", () => {
  it("default export is callable", () => {
    expect(typeof faxios).toBe("function");
  });

  it("named exports are present", () => {
    expect(FaxiosError).toBeDefined();
    expect(AxiosHeaders).toBeDefined();
  });
});
