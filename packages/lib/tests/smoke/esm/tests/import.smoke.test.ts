import faxios, { CanceledError, AxiosError, AxiosHeaders } from "faxios";
import settle from "faxios/unsafe/core/settle.js";
import { describe, expect, it } from "vitest";

describe("ESM importing", () => {
  it("should import faxios", () => {
    expect(typeof faxios).toStrictEqual("function");
  });

  it("should import CanceledError", () => {
    expect(typeof CanceledError).toStrictEqual("function");
  });

  it("should import AxiosError", () => {
    expect(typeof AxiosError).toStrictEqual("function");
  });

  it("should import AxiosHeaders", () => {
    expect(typeof AxiosHeaders).toStrictEqual("function");
  });

  it("should import settle", () => {
    expect(typeof settle).toStrictEqual("function");
  });

  it("should import CanceledError from faxios", () => {
    expect(faxios.CanceledError).toStrictEqual(CanceledError);
  });

  it("should import AxiosError from faxios", () => {
    expect(faxios.AxiosError).toStrictEqual(AxiosError);
  });

  it("should import AxiosHeaders from faxios", () => {
    expect(faxios.AxiosHeaders).toStrictEqual(AxiosHeaders);
  });
});
