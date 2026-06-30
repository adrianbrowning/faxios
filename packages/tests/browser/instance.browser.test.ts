import { describe, expect, it } from "vitest";

import faxios from "#src/index.js";
import type InterceptorManager from "#src/lib/core/InterceptorManager.js";
import type { InternalFaxiosRequestConfig } from "#src/lib/types.js";

import { installFetchMock } from "./helpers/fetchMock.js";

describe("instance (vitest browser)", () => {
  it("should have the same methods as default instance", () => {
    const instance = faxios.create();
    const defaultInstance = faxios as unknown as Record<string, unknown>;
    const createdInstance = instance as unknown as Record<string, unknown>;

    for (const prop in defaultInstance) {
      if (
        [
          "Faxios",
          "FaxiosError",
          "create",
          "Cancel",
          "CanceledError",
          "CancelToken",
          "isCancel",
          "all",
          "spread",
          "getUri",
          "isFaxiosError",
          "mergeConfig",
          "getAdapter",
          "VERSION",
          "default",
          "toFormData",
          "formToJSON",
          "FaxiosHeaders",
          "HttpStatusCode",
        ].includes(prop)
      ) {
        continue;
      }

      expect(typeof createdInstance[prop]).toBe(typeof defaultInstance[prop]);
    }
  });

  it("should make an http request without verb helper", async () => {
    using mock = installFetchMock();
    const instance = faxios.create();

    await instance("/foo");

    expect(new URL(mock.lastRequest!.url).pathname).toBe("/foo");
  });

  it("should make an http request with url instead of baseURL", async () => {
    using mock = installFetchMock();
    const instance = faxios.create({
      url: "https://api.example.com",
    });

    await instance("/foo");

    expect(new URL(mock.lastRequest!.url).pathname).toBe("/foo");
  });

  it("should make an http request", async () => {
    using mock = installFetchMock();
    const instance = faxios.create();

    await instance.get("/foo");

    expect(new URL(mock.lastRequest!.url).pathname).toBe("/foo");
  });

  it("should use instance options", async () => {
    using mock = installFetchMock();
    const instance = faxios.create({ timeout: 1000 });

    await instance.get("/foo");

    expect(mock.lastRequest).toBeDefined();
    expect(new URL(mock.lastRequest!.url).pathname).toBe("/foo");
  });

  it("should have defaults.headers", () => {
    const instance = faxios.create({
      baseURL: "https://api.example.com",
    });

    expect(typeof instance.defaults.headers).toBe("object");
    expect(typeof instance.defaults.headers.common).toBe("object");
  });

  it("should have interceptors on the instance", async () => {
    using _mock = installFetchMock();
    const requestInterceptorId = (
      faxios.interceptors
        .request as unknown as InterceptorManager<InternalFaxiosRequestConfig>
    ).use(config => {
      (config as InternalFaxiosRequestConfig & Record<string, unknown>).foo =
        true;
      return config;
    });

    const instance = faxios.create();
    const instanceInterceptorId = (
      instance.interceptors
        .request as unknown as InterceptorManager<InternalFaxiosRequestConfig>
    ).use(config => {
      (config as InternalFaxiosRequestConfig & Record<string, unknown>).bar =
        true;
      return config;
    });

    try {
      const response = await instance.get("/foo");

      expect(
        (response.config as unknown as Record<string, unknown>).foo
      ).toBeUndefined();
      expect((response.config as unknown as Record<string, unknown>).bar).toBe(
        true
      );
    }
    finally {
      (
        faxios.interceptors
          .request as unknown as InterceptorManager<InternalFaxiosRequestConfig>
      ).eject(requestInterceptorId);
      (
        instance.interceptors
          .request as unknown as InterceptorManager<InternalFaxiosRequestConfig>
      ).eject(instanceInterceptorId);
    }
  });

  it("should have getUri on the instance", () => {
    const instance = faxios.create({
      baseURL: "https://api.example.com",
    });
    const options = {
      url: "foo/bar",
      params: {
        name: "faxios",
      },
    };

    expect(instance.getUri(options)).toBe(
      "https://api.example.com/foo/bar?name=faxios"
    );
  });

  it("should correctly build url without baseURL", () => {
    const instance = faxios.create();
    const options = {
      url: "foo/bar?foo=bar",
      params: {
        name: "faxios",
      },
    };

    expect(instance.getUri(options)).toBe("foo/bar?foo=bar&name=faxios");
  });

  it("should correctly discard url hash mark", () => {
    const instance = faxios.create();
    const options = {
      baseURL: "https://api.example.com",
      url: "foo/bar?foo=bar#hash",
      params: {
        name: "faxios",
      },
    };

    expect(instance.getUri(options)).toBe(
      "https://api.example.com/foo/bar?foo=bar&name=faxios"
    );
  });
});
