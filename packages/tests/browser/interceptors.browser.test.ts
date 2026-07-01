import { afterEach, describe, expect, it, vi } from "vitest";

import faxios from "#src/index.js";
import type { InternalFaxiosRequestConfig } from "#src/index.js";

import { installFetchMock } from "./helpers/fetchMock.js";

describe("interceptors (vitest browser)", () => {
  afterEach(() => {
    faxios.interceptors.request.clear();
    faxios.interceptors.response.clear();
    vi.restoreAllMocks();
  });

  it("should add a request interceptor (asynchronous by default)", async () => {
    using mock = installFetchMock();
    let asyncFlag = false;

    faxios.interceptors.request.use(config => {
      config.headers.test = "added by interceptor";
      expect(asyncFlag).toBe(true);
      return config;
    });

    const responsePromise = faxios("/foo");
    asyncFlag = true;

    await responsePromise;
    expect(mock.lastRequest!.headers.get("test")).toBe("added by interceptor");
  });

  it("should add a request interceptor (explicitly flagged as asynchronous)", async () => {
    using mock = installFetchMock();
    let asyncFlag = false;

    faxios.interceptors.request.use(
      config => {
        config.headers.test = "added by interceptor";
        expect(asyncFlag).toBe(true);
        return config;
      },
      null,
      { synchronous: false }
    );

    const responsePromise = faxios("/foo");
    asyncFlag = true;

    await responsePromise;
    expect(mock.lastRequest!.headers.get("test")).toBe("added by interceptor");
  });

  it("should add a request interceptor that is executed synchronously when flag is provided", async () => {
    using mock = installFetchMock();
    let asyncFlag = false;

    faxios.interceptors.request.use(
      config => {
        config.headers.test = "added by synchronous interceptor";
        expect(asyncFlag).toBe(false);
        return config;
      },
      null,
      { synchronous: true }
    );

    const responsePromise = faxios("/foo");
    asyncFlag = true;

    await responsePromise;
    expect(mock.lastRequest!.headers.get("test")).toBe(
      "added by synchronous interceptor"
    );
  });

  it("should execute asynchronously when not all interceptors are explicitly flagged as synchronous", async () => {
    using mock = installFetchMock();
    let asyncFlag = false;

    faxios.interceptors.request.use(config => {
      config.headers.foo = "uh oh, async";
      expect(asyncFlag).toBe(true);
      return config;
    });

    faxios.interceptors.request.use(
      config => {
        config.headers.test = "added by synchronous interceptor";
        expect(asyncFlag).toBe(true);
        return config;
      },
      null,
      { synchronous: true }
    );

    faxios.interceptors.request.use(config => {
      config.headers.test = "added by the async interceptor";
      expect(asyncFlag).toBe(true);
      return config;
    });

    const responsePromise = faxios("/foo");
    asyncFlag = true;

    await responsePromise;
    expect(mock.lastRequest!.headers.get("foo")).toBe("uh oh, async");
    expect(mock.lastRequest!.headers.get("test")).toBe(
      "added by synchronous interceptor"
    );
  });

  it("should execute request interceptor in legacy order", async () => {
    using _mock = installFetchMock();
    let sequence = "";

    faxios.interceptors.request.use(config => {
      sequence += "1";
      return config;
    });

    faxios.interceptors.request.use(config => {
      sequence += "2";
      return config;
    });

    faxios.interceptors.request.use(config => {
      sequence += "3";
      return config;
    });

    await faxios({ url: "/foo" });

    expect(sequence).toBe("321");
  });

  it("should execute request interceptor in order", async () => {
    using _mock = installFetchMock();
    let sequence = "";

    faxios.interceptors.request.use(config => {
      sequence += "1";
      return config;
    });

    faxios.interceptors.request.use(config => {
      sequence += "2";
      return config;
    });

    faxios.interceptors.request.use(config => {
      sequence += "3";
      return config;
    });

    await faxios({
      url: "/foo",
      transitional: {
        legacyInterceptorReqResOrdering: false,
      },
    });

    expect(sequence).toBe("123");
  });

  it("runs the interceptor if runWhen function is provided and resolves to true", async () => {
    using mock = installFetchMock();
    const onGetCall = (config: InternalFaxiosRequestConfig) =>
      config.method === "get";

    faxios.interceptors.request.use(
      config => {
        config.headers.test = "special get headers";
        return config;
      },
      null,
      { runWhen: onGetCall }
    );

    await faxios("/foo");

    expect(mock.lastRequest!.headers.get("test")).toBe("special get headers");
  });

  it("does not run the interceptor if runWhen function is provided and resolves to false", async () => {
    using mock = installFetchMock();
    const onPostCall = (config: InternalFaxiosRequestConfig) =>
      config.method === "post";

    faxios.interceptors.request.use(
      config => {
        config.headers.test = "special get headers";
        return config;
      },
      null,
      { runWhen: onPostCall }
    );

    await faxios("/foo");

    expect(mock.lastRequest!.headers.get("test")).toBeNull();
  });

  it("does not run async interceptor if runWhen resolves to false (and runs synchronously)", async () => {
    using mock = installFetchMock();
    let asyncFlag = false;
    const onPostCall = (config: InternalFaxiosRequestConfig) =>
      config.method === "post";

    faxios.interceptors.request.use(
      config => {
        config.headers.test = "special get headers";
        return config;
      },
      null,
      { synchronous: false, runWhen: onPostCall }
    );

    faxios.interceptors.request.use(
      config => {
        config.headers.sync = "hello world";
        expect(asyncFlag).toBe(false);
        return config;
      },
      null,
      { synchronous: true }
    );

    const responsePromise = faxios("/foo");
    asyncFlag = true;

    await responsePromise;
    expect(mock.lastRequest!.headers.get("test")).toBeNull();
    expect(mock.lastRequest!.headers.get("sync")).toBe("hello world");
  });

  it("should call request onRejected when interceptor throws", async () => {
    using _mock = installFetchMock();
    const rejectedSpy = vi.fn();
    const error = new Error("deadly error");

    faxios.interceptors.request.use(
      () => {
        throw error;
      },
      rejectedSpy,
      { synchronous: true }
    );

    await faxios("/foo").catch(() => {});

    expect(rejectedSpy).toHaveBeenCalledWith(error);
  });

  it("should add a request interceptor that returns a new config object", async () => {
    using mock = installFetchMock();
    faxios.interceptors.request.use(
      () =>
        ({
          url: "/bar",
          method: "post",
        }) as InternalFaxiosRequestConfig
    );

    await faxios("/foo");

    expect(mock.lastRequest!.method).toBe("POST");
    expect(new URL(mock.lastRequest!.url).pathname).toBe("/bar");
  });

  it("should add a request interceptor that returns a promise", async () => {
    using mock = installFetchMock();
    faxios.interceptors.request.use(
      async config =>
        new Promise<typeof config>(resolve => {
          setTimeout(() => {
            config.headers.async = "promise";
            resolve(config);
          }, 100);
        })
    );

    await faxios("/foo");

    expect(mock.lastRequest!.headers.get("async")).toBe("promise");
  });

  it("should add multiple request interceptors", async () => {
    using mock = installFetchMock();
    faxios.interceptors.request.use(config => {
      config.headers.test1 = "1";
      return config;
    });
    faxios.interceptors.request.use(config => {
      config.headers.test2 = "2";
      return config;
    });
    faxios.interceptors.request.use(config => {
      config.headers.test3 = "3";
      return config;
    });

    await faxios("/foo");

    expect(mock.lastRequest!.headers.get("test1")).toBe("1");
    expect(mock.lastRequest!.headers.get("test2")).toBe("2");
    expect(mock.lastRequest!.headers.get("test3")).toBe("3");
  });

  it("should add a response interceptor", async () => {
    using mock = installFetchMock();
    mock.respondWith({ body: "OK" });

    faxios.interceptors.response.use(data => {
      data.data = `${data.data} - modified by interceptor`;
      return data;
    });

    const response = await faxios("/foo");
    expect(response.data).toBe("OK - modified by interceptor");
  });

  it("should add a response interceptor when request interceptor is defined", async () => {
    using mock = installFetchMock();
    mock.respondWith({ body: "OK" });

    faxios.interceptors.request.use(data => data);

    faxios.interceptors.response.use(data => {
      data.data = `${data.data} - modified by interceptor`;
      return data;
    });

    const response = await faxios("/foo");
    expect(response.data).toBe("OK - modified by interceptor");
  });

  it("should add a response interceptor that returns a new data object", async () => {
    using mock = installFetchMock();
    mock.respondWith({ body: "OK" });

    faxios.interceptors.response.use(() => ({
      data: "stuff",
    }));

    const response = await faxios("/foo");
    expect(response.data).toBe("stuff");
  });

  it("should add a response interceptor that returns a promise", async () => {
    using mock = installFetchMock();
    mock.respondWith({ body: "OK" });

    faxios.interceptors.response.use(
      async data =>
        new Promise(resolve => {
          setTimeout(() => {
            data.data = "you have been promised!";
            resolve(data);
          }, 10);
        })
    );

    const response = await faxios("/foo");
    expect(response.data).toBe("you have been promised!");
  });

  describe("given multiple response interceptors", () => {
    const fireRequest = async () => faxios("/foo");

    it("then each interceptor is executed", async () => {
      using mock = installFetchMock();
      mock.respondWith({ body: "OK" });
      const interceptor1 = vi.fn(response => response);
      const interceptor2 = vi.fn(response => response);

      faxios.interceptors.response.use(interceptor1);
      faxios.interceptors.response.use(interceptor2);

      await fireRequest();

      expect(interceptor1).toHaveBeenCalled();
      expect(interceptor2).toHaveBeenCalled();
    });

    it("then they are executed in the order they were added", async () => {
      using mock = installFetchMock();
      mock.respondWith({ body: "OK" });
      const interceptor1 = vi.fn(response => response);
      const interceptor2 = vi.fn(response => response);

      faxios.interceptors.response.use(interceptor1);
      faxios.interceptors.response.use(interceptor2);

      await fireRequest();

      expect(interceptor1.mock.invocationCallOrder[0]!).toBeLessThan(
        interceptor2.mock.invocationCallOrder[0]!
      );
    });

    it("then only the last interceptor's result is returned", async () => {
      using mock = installFetchMock();
      mock.respondWith({ body: "OK" });
      faxios.interceptors.response.use(() => "response 1");
      faxios.interceptors.response.use(() => "response 2");

      const response = await fireRequest();
      expect(response).toBe("response 2");
    });

    it("then every interceptor receives the result of its predecessor", async () => {
      using mock = installFetchMock();
      mock.respondWith({ body: "OK" });
      faxios.interceptors.response.use(() => "response 1");
      faxios.interceptors.response.use(response => [ response, "response 2" ]);

      const response = await fireRequest();
      expect(response).toEqual([ "response 1", "response 2" ]);
    });

    describe("and when the fulfillment interceptor throws", () => {
      const fireRequestCatch = async () => {
        await faxios("/foo").catch(() => {});
      };

      it("then the following fulfillment interceptor is not called", async () => {
        using mock = installFetchMock();
        mock.respondWith({ body: "OK" });
        faxios.interceptors.response.use(() => {
          throw new Error("throwing interceptor");
        });

        const interceptor2 = vi.fn(response => response);
        faxios.interceptors.response.use(interceptor2);

        await fireRequestCatch();
        expect(interceptor2).not.toHaveBeenCalled();
      });

      it("then the following rejection interceptor is called", async () => {
        using mock = installFetchMock();
        mock.respondWith({ body: "OK" });
        faxios.interceptors.response.use(() => {
          throw new Error("throwing interceptor");
        });

        // eslint-disable-next-line promise/no-promise-in-callback
        const rejectIntercept = vi.fn(async error => Promise.reject(error));
        faxios.interceptors.response.use(() => {}, rejectIntercept);

        await fireRequestCatch();
        expect(rejectIntercept).toHaveBeenCalled();
      });

      it("once caught, another following fulfillment interceptor is called again", async () => {
        using mock = installFetchMock();
        mock.respondWith({ body: "OK" });
        faxios.interceptors.response.use(() => {
          throw new Error("throwing interceptor");
        });

        faxios.interceptors.response.use(
          () => {},
          () => "recovered"
        );

        const interceptor3 = vi.fn(response => response);
        faxios.interceptors.response.use(interceptor3);

        await fireRequestCatch();
        expect(interceptor3).toHaveBeenCalled();
      });
    });
  });

  it("should allow removing interceptors", async () => {
    using mock = installFetchMock();
    mock.respondWith({ body: "OK" });

    faxios.interceptors.response.use(data => {
      data.data = `${data.data}1`;
      return data;
    });
    const intercept = faxios.interceptors.response.use(data => {
      data.data = `${data.data}2`;
      return data;
    });
    faxios.interceptors.response.use(data => {
      data.data = `${data.data}3`;
      return data;
    });

    faxios.interceptors.response.eject(intercept);

    const response = await faxios("/foo");
    expect(response.data).toBe("OK13");
  });

  it("should remove async interceptor before making request and execute synchronously", async () => {
    using mock = installFetchMock();
    let asyncFlag = false;

    const asyncIntercept = faxios.interceptors.request.use(
      config => {
        config.headers.async = "async it!";
        return config;
      },
      null,
      { synchronous: false }
    );

    faxios.interceptors.request.use(
      config => {
        config.headers.sync = "hello world";
        expect(asyncFlag).toBe(false);
        return config;
      },
      null,
      { synchronous: true }
    );

    faxios.interceptors.request.eject(asyncIntercept);

    const responsePromise = faxios("/foo");
    asyncFlag = true;

    await responsePromise;
    expect(mock.lastRequest!.headers.get("async")).toBeNull();
    expect(mock.lastRequest!.headers.get("sync")).toBe("hello world");
  });

  it("should execute interceptors before transformers", async () => {
    using mock = installFetchMock();
    faxios.interceptors.request.use(config => {
      (config.data as Record<string, unknown>).baz = "qux";
      return config;
    });

    await faxios.post("/foo", { foo: "bar" });

    expect(await mock.lastRequest!.clone().text()).toEqual(
      "{\"foo\":\"bar\",\"baz\":\"qux\"}"
    );
  });

  it("should modify base URL in request interceptor", async () => {
    using mock = installFetchMock();
    const instance = faxios.create({
      baseURL: "http://test.com/",
    });

    instance.interceptors.request.use(config => {
      config.baseURL = "http://rebase.com/";
      return config;
    });

    await instance.get("/foo");

    expect(mock.lastRequest!.url).toBe("http://rebase.com/foo");
  });

  it("should clear all request interceptors", () => {
    const instance = faxios.create({
      baseURL: "http://test.com/",
    });

    const id = instance.interceptors.request.use(config => config);
    instance.interceptors.request.clear();

    // After clear(), eject on any prior id is a no-op (Map.delete returns false)
    expect(instance.interceptors.request.eject(id)).toBeUndefined();
  });

  it("should clear all response interceptors", () => {
    const instance = faxios.create({
      baseURL: "http://test.com/",
    });

    const id = instance.interceptors.response.use(config => config);
    instance.interceptors.response.clear();

    expect(instance.interceptors.response.eject(id)).toBeUndefined();
  });
});

describe("prepareRequest regression: clone-swap guards", () => {
  afterEach(() => {
    faxios.interceptors.request.clear();
    faxios.interceptors.response.clear();
    vi.restoreAllMocks();
  });

  it("interceptor config mutation is reflected exactly once in the outbound request", async () => {
    // Guards against a double-merge reintroducing the redundant mergeConfig clone.
    // The interceptor sets a custom header; it must appear exactly once (not doubled
    // or absent) in the final fetch call.
    using mock = installFetchMock();

    faxios.interceptors.request.use((config: InternalFaxiosRequestConfig) => {
      config.headers.set("x-interceptor", "once");
      return config;
    });

    await faxios.get("/regression/interceptor");

    // Headers.get() joins duplicate values with ", " — "once, once" would mean double-merge.
    expect(mock.lastRequest!.headers.get("x-interceptor")).toBe("once");
  });

  it("polluted Object.prototype field does not leak into the outbound fetch call", async () => {
    // Guards the null-proto clone in prepareRequest: fetch.ts destructures config
    // fields without hasOwnProp guards, relying on the prototype chain being empty.
    using mock = installFetchMock();

    (Object.prototype as Record<string, unknown>).maxBodyLength = 1;
    try {
      // A real request should succeed; if maxBodyLength=1 leaked, the body-size
      // guard in fetch.ts would reject it (body is empty here, so success proves
      // the polluted value was not read from the prototype chain as an own value).
      const res = await faxios.post("/regression/pollution", { data: "hello" });
      expect(res.status).toBe(200);
      expect(mock.lastRequest).toBeDefined();
    }
    finally {
      delete (Object.prototype as Record<string, unknown>).maxBodyLength;
    }
  });
});
