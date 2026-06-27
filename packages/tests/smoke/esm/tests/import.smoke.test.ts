import faxios, { CanceledError, FaxiosError, FaxiosHeaders } from "faxios";
import settle from "faxios/unsafe/core/settle.js";
import { describe, expect, it } from "vitest";

describe("ESM importing", () => {
  it("should import faxios", () => {
    expect(typeof faxios).toStrictEqual("function");
  });

  it("should import CanceledError", () => {
    expect(typeof CanceledError).toStrictEqual("function");
  });

  it("should import FaxiosError", () => {
    expect(typeof FaxiosError).toStrictEqual("function");
  });

  it("should import FaxiosHeaders", () => {
    expect(typeof FaxiosHeaders).toStrictEqual("function");
  });

  it("should import settle", () => {
    expect(typeof settle).toStrictEqual("function");
  });

  it("should import CanceledError from faxios", () => {
    expect(faxios.CanceledError).toStrictEqual(CanceledError);
  });

  it("should import FaxiosError from faxios", () => {
    expect(faxios.FaxiosError).toStrictEqual(FaxiosError);
  });

  it("should import FaxiosHeaders from faxios", () => {
    expect(faxios.FaxiosHeaders).toStrictEqual(FaxiosHeaders);
  });
});
