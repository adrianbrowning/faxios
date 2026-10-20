import assert from "node:assert";
import { describe, it, vi } from "vitest";
import faxios, { CanceledError, FaxiosError } from "#src/index.ts";
import { authBearer } from "#src/lib/plugins/authBearer.ts";
import { authenticate } from "#src/lib/plugins/authenticate.ts";
import { refreshAuth } from "#src/lib/plugins/refreshAuth.ts";
import { retry } from "#src/lib/plugins/retry.ts";

const BASE = "http://api.test";

type Sent = { authorization: null | string; method: string; url: string; };

// Answers 200 to the token `valid()` names and `status` (401) to anything else. `reached(n)`
// resolves once n requests have reached fetch.
function server(valid: () => string, status = 401) {
  const sent: Array<Sent> = [];
  const waiting: Array<{ count: number; resolve: () => void; }> = [];
  const fetch = async (input: Request | string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const url = input instanceof Request ? input.url : String(input);
    sent.push({ authorization: headers.get("authorization"), method: init?.method ?? "GET", url });
    for (const { count, resolve } of waiting) if (sent.length >= count) resolve();
    return new Response(null, { status: headers.get("authorization") === `Bearer ${valid()}` ? 200 : status });
  };
  const reached = async (count: number) => new Promise<void>(resolve => {
    if (sent.length >= count) resolve();
    else waiting.push({ count, resolve });
  });
  return { fetch, reached, sent };
}

// A refresh the test settles by hand.
function gate() {
  let open!: () => void;
  let fail!: (reason: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    open = resolve;
    fail = reject;
  });
  return { fail, open, promise };
}

const isCode = (code: string) => (err: unknown) => err instanceof FaxiosError && err.code === code;

describe("plugins::refreshAuth", () => {
  it("refreshes after a 401 and sends the request again with the new credentials", async () => {
    let token = "old";
    const { fetch, sent } = server(() => "new");
    const errors: Array<unknown> = [];
    const api = faxios.create({ baseURL: BASE, env: { fetch } })
      .use(refreshAuth(async error => {
        errors.push(error.response?.status);
        token = "new";
      }))
      .use(authBearer(() => token));

    const response = await api.post("/orders", { item: 1 });

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(sent.map(s => [ s.method, s.authorization ]), [[ "POST", "Bearer old" ], [ "POST", "Bearer new" ]]);
    assert.deepStrictEqual(errors, [ 401 ]);
  });

  it("sends the request again only once, rejecting with the second 401", async () => {
    let refreshes = 0;
    const { fetch, sent } = server(() => "never");
    const api = faxios.create({ baseURL: BASE, env: { fetch } })
      .use(refreshAuth(() => {
        refreshes++;
      }))
      .use(authBearer(() => "token"));

    await assert.rejects(api.get("/me"), (err: unknown) => err instanceof FaxiosError && err.response?.status === 401);
    assert.strictEqual(sent.length, 2);
    assert.strictEqual(refreshes, 1);
  });

  it("shares one refresh between concurrent 401s", async () => {
    let token = "old";
    let refreshes = 0;
    const refresh = gate();
    const { fetch, reached, sent } = server(() => "new");
    const api = faxios.create({ baseURL: BASE, env: { fetch } })
      .use(refreshAuth(async () => {
        refreshes++;
        await refresh.promise;
        token = "new";
      }))
      .use(authBearer(() => token));

    const requests = Promise.all([ api.get("/a"), api.get("/b"), api.get("/c") ]);
    await reached(3);
    refresh.open();
    const responses = await requests;

    assert.deepStrictEqual(responses.map(r => r.status), [ 200, 200, 200 ]);
    assert.strictEqual(refreshes, 1);
    assert.deepStrictEqual(sent.slice(3).map(s => s.authorization), [ "Bearer new", "Bearer new", "Bearer new" ]);
  });

  // The request went out with the credentials the earlier refresh replaced, so it needs no new one.
  it("sends a request that failed after a refresh finished again without refreshing", async () => {
    let token = "old";
    let refreshes = 0;
    let holdB!: () => void;
    const bHeld = new Promise<void>(resolve => {
      holdB = resolve;
    });
    const sent: Array<null | string> = [];
    const fetch = async (input: Request | string | URL, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("authorization");
      sent.push(authorization);
      const url = input instanceof Request ? input.url : String(input);
      // B's first answer arrives only after A's refresh finished.
      if (url.endsWith("/b") && authorization === "Bearer old") await bHeld;
      return new Response(null, { status: authorization === "Bearer new" ? 200 : 401 });
    };
    const api = faxios.create({ baseURL: BASE, env: { fetch } })
      .use(refreshAuth(() => {
        refreshes++;
        token = "new";
      }))
      .use(authBearer(() => token));

    const b = api.get("/b");
    await api.get("/a");
    holdB();
    await b;

    assert.strictEqual(refreshes, 1);
    assert.deepStrictEqual(sent, [ "Bearer old", "Bearer old", "Bearer new", "Bearer new" ]);
  });

  it("rejects every waiting request with the refresh's error, and refreshes again on the next 401", async () => {
    let attempt = 0;
    const { fetch } = server(() => "never");
    const failure = new Error("refresh token expired");
    const api = faxios.create({ baseURL: BASE, env: { fetch } })
      .use(refreshAuth(async () => {
        attempt++;
        await Promise.resolve();
        throw failure;
      }))
      .use(authBearer(() => "token"));

    const results = await Promise.allSettled([ api.get("/a"), api.get("/b") ]);
    assert.deepStrictEqual(results.map(r => r.status === "rejected" && r.reason), [ failure, failure ]);
    assert.strictEqual(attempt, 1);

    await assert.rejects(api.get("/c"), failure);
    assert.strictEqual(attempt, 2);
  });

  it("refreshes again on the next 401 after a refresh that threw synchronously", async () => {
    let token = "old";
    let refreshes = 0;
    const failure = new Error("no refresh token stored");
    const { fetch } = server(() => "new");
    const api = faxios.create({ baseURL: BASE, env: { fetch } })
      .use(refreshAuth(() => {
        if (++refreshes === 1) throw failure;
        token = "new";
      }))
      .use(authBearer(() => token));

    await assert.rejects(api.get("/a"), failure);
    assert.strictEqual((await api.get("/b")).status, 200);
    assert.strictEqual(refreshes, 2);
  });

  it("leaves other statuses, other origins and stream bodies alone", async () => {
    let refreshes = 0;
    const plugin = refreshAuth(() => {
      refreshes++;
    });
    const forbidden = server(() => "never", 403);
    await assert.rejects(faxios.create({ baseURL: BASE, env: { fetch: forbidden.fetch } }).use(plugin)
      .get("/a"));
    const other = server(() => "never");
    await assert.rejects(faxios.create({ baseURL: BASE, allowAbsoluteUrls: true, env: { fetch: other.fetch } }).use(plugin)
      .get("https://other.test/a"));
    const stream = server(() => "never");
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x"));
        controller.close();
      },
    });
    await assert.rejects(faxios.create({ baseURL: BASE, env: { fetch: stream.fetch } }).use(plugin)
      .post("/upload", body));

    assert.strictEqual(refreshes, 0);
    assert.deepStrictEqual([ forbidden.sent.length, other.sent.length, stream.sent.length ], [ 1, 1, 1 ]);
  });

  describe("a 401 after a redirect", () => {
    // A 401 whose Response reports `finalURL` and `redirected`, as fetch does after a redirect.
    const answeredFrom = (finalURL: string, redirected = true) => {
      const sent: Array<string> = [];
      const fetch = async (input: Request | string | URL) => {
        sent.push(input instanceof Request ? input.url : String(input));
        const response = new Response(null, { status: 401 });
        Object.defineProperties(response, { redirected: { value: redirected }, url: { value: finalURL } });
        return response;
      };
      return { fetch, sent };
    };

    it("doesn't refresh when the 401 came from another origin", async () => {
      let refreshes = 0;
      const { fetch, sent } = answeredFrom("https://storage.other.test/file");
      const api = faxios.create({ baseURL: BASE, env: { fetch } }).use(refreshAuth(() => {
        refreshes++;
      }));

      const err = await api.get("/files/1").catch((error: unknown) => error);

      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.response?.status, 401);
      assert.strictEqual(err.response?.redirected, true);
      assert.strictEqual(err.response?.url, "https://storage.other.test/file");
      assert.strictEqual(refreshes, 0);
      assert.strictEqual(sent.length, 1);
    });

    it("doesn't refresh a redirected 401 that doesn't say where it came from", async () => {
      let refreshes = 0;
      const { fetch, sent } = answeredFrom("");
      const api = faxios.create({ baseURL: BASE, env: { fetch } }).use(refreshAuth(() => {
        refreshes++;
      }));

      await assert.rejects(api.get("/files/1"), (err: unknown) => err instanceof FaxiosError && err.response?.url === undefined);
      assert.strictEqual(refreshes, 0);
      assert.strictEqual(sent.length, 1);
    });

    it("refreshes when the 401 came from the API's origin, from one in origins, or wasn't redirected", async () => {
      let refreshes = 0;
      const refresh = () => {
        refreshes++;
      };
      const sameOrigin = answeredFrom(`${BASE}/v2/files/1`);
      const listed = answeredFrom("https://files.api.test/1");
      // A custom fetch may report any URL; without a redirect it is still the API's answer.
      const notRedirected = answeredFrom("https://storage.other.test/file", false);

      await assert.rejects(faxios.create({ baseURL: BASE, env: { fetch: sameOrigin.fetch } }).use(refreshAuth(refresh))
        .get("/files/1"));
      await assert.rejects(faxios.create({ baseURL: BASE, env: { fetch: listed.fetch } })
        .use(refreshAuth(refresh, { origins: [ BASE, "https://files.api.test" ] }))
        .get("/files/1"));
      await assert.rejects(faxios.create({ baseURL: BASE, env: { fetch: notRedirected.fetch } }).use(refreshAuth(refresh))
        .get("/files/1"));

      assert.strictEqual(refreshes, 3);
      assert.deepStrictEqual([ sameOrigin.sent.length, listed.sent.length, notRedirected.sent.length ], [ 2, 2, 2 ]);
    });
  });

  it("refreshes on the statuses listed, or when refreshOn says so", async () => {
    let refreshes = 0;
    const { fetch, sent } = server(() => "never", 403);
    const byStatus = faxios.create({ baseURL: BASE, env: { fetch } }).use(refreshAuth(() => {
      refreshes++;
    }, { statuses: [ 401, 403 ] }));
    const byPredicate = faxios.create({ baseURL: BASE, env: { fetch } }).use(refreshAuth(() => {
      refreshes++;
    }, { refreshOn: error => error.response?.status === 403, statuses: [ 500 ] }));

    await assert.rejects(byStatus.get("/a"));
    await assert.rejects(byPredicate.get("/b"));

    assert.strictEqual(refreshes, 2);
    assert.strictEqual(sent.length, 4);
  });

  it("cancels the stream body of the error when refreshOn throws, and rejects with refreshOn's error", async () => {
    let cancelled = 0;
    const failure = new Error("refreshOn failed");
    const fetch = async () => new Response(new ReadableStream<Uint8Array>({
      cancel() {
        cancelled++;
      },
    }), { status: 401 });
    const api = faxios.create({ baseURL: BASE, env: { fetch } }).use(refreshAuth(() => {}, {
      refreshOn: () => {
        throw failure;
      },
    }));

    await assert.rejects(api.get("/a", { responseType: "stream" }), failure);
    // The request rejects with refreshOn's error, so nothing reads the 401's body.
    assert.strictEqual(cancelled, 1);
  });

  it("refreshes once in the documented order with retry, which retries the second try", async () => {
    vi.useFakeTimers();
    try {
      let token = "old";
      let refreshes = 0;
      const sent: Array<null | string> = [];
      // 401 to the old token; to the new one a 503, then a 200.
      const fetch = async (_input: Request | string | URL, init?: RequestInit) => {
        const authorization = new Headers(init?.headers).get("authorization");
        sent.push(authorization);
        if (authorization !== "Bearer new") return new Response(null, { status: 401 });
        return new Response(null, { status: sent.length === 2 ? 503 : 200 });
      };
      const api = faxios.create({ baseURL: BASE, env: { fetch } })
        .use(refreshAuth(() => {
          refreshes++;
          token = "new";
        }))
        .use(retry({ delay: 0 }))
        .use(authBearer(() => token));

      const request = api.get("/me");
      await vi.runAllTimersAsync();
      const response = await request;

      assert.strictEqual(response.status, 200);
      assert.strictEqual(refreshes, 1);
      assert.deepStrictEqual(sent, [ "Bearer old", "Bearer new", "Bearer new" ]);
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("works with authenticate's query credentials", async () => {
    let key = "old";
    const sent: Array<string> = [];
    const fetch = async (input: Request | string | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      sent.push(url);
      return new Response(null, { status: url.endsWith("key=new") ? 200 : 401 });
    };
    const api = faxios.create({ baseURL: BASE, env: { fetch } })
      .use(refreshAuth(() => {
        key = "new";
      }))
      .use(authenticate(() => ({ query: { key } })));

    await api.get("/data");

    assert.deepStrictEqual(sent, [ `${BASE}/data?key=old`, `${BASE}/data?key=new` ]);
  });

  describe("cancellation", () => {
    it("rejects a request aborted while the refresh runs at once, and the refresh goes on for the others", async () => {
      let token = "old";
      const started = gate();
      const refresh = gate();
      const { fetch, reached, sent } = server(() => "new");
      const api = faxios.create({ baseURL: BASE, env: { fetch } })
        .use(refreshAuth(async () => {
          started.open();
          await refresh.promise;
          token = "new";
        }))
        .use(authBearer(() => token));
      const controller = new AbortController();

      // The refresh starts from /a's 401, so /a is waiting on it.
      const aborted = api.get("/a", { signal: controller.signal });
      await started.promise;
      const other = api.get("/b");
      await reached(2);
      controller.abort();

      await assert.rejects(aborted, (err: unknown) => err instanceof CanceledError);
      refresh.open();
      assert.strictEqual((await other).status, 200);
      assert.deepStrictEqual(sent.map(s => s.url), [ `${BASE}/a`, `${BASE}/b`, `${BASE}/b` ]);
    });

    it("sends nothing again when the signal aborts inside refresh", async () => {
      let token = "old";
      const controller = new AbortController();
      const { fetch, sent } = server(() => "new");
      const api = faxios.create({ baseURL: BASE, env: { fetch } })
        .use(refreshAuth(() => {
          token = "new";
          controller.abort();
        }))
        .use(authBearer(() => token));

      await assert.rejects(api.get("/a", { signal: controller.signal }), (err: unknown) => err instanceof CanceledError);
      assert.strictEqual(sent.length, 1);
    });

    it("sends nothing more when the signal aborts during the second try", async () => {
      let token = "old";
      let tries = 0;
      const controller = new AbortController();
      const { fetch, sent } = server(() => "new");
      const api = faxios.create({ baseURL: BASE, env: { fetch } })
        .use(refreshAuth(() => {
          token = "new";
        }))
        // Runs on each try after refreshAuth: the abort lands once the second try has begun.
        .use(async (ctx, next) => {
          if (++tries === 2) controller.abort();
          return next(ctx);
        })
        .use(authBearer(() => token));

      await assert.rejects(api.get("/a", { signal: controller.signal }), (err: unknown) => err instanceof CanceledError);
      assert.strictEqual(tries, 2);
      assert.strictEqual(sent.length, 1);
    });

    it("sends nothing again when the signal aborts after the refresh settled, before the second try", async () => {
      let token = "old";
      let settled = false;
      let tries = 0;
      const controller = new AbortController();
      // Aborts as refreshAuth stops watching the signal, which it does once the refresh has settled.
      const removeEventListener = controller.signal.removeEventListener.bind(controller.signal);
      Object.defineProperty(controller.signal, "removeEventListener", {
        value: (type: string, listener: () => void) => {
          removeEventListener(type, listener);
          if (settled) controller.abort();
        },
      });
      const { fetch, sent } = server(() => "new");
      const api = faxios.create({ baseURL: BASE, env: { fetch } })
        .use(refreshAuth(async () => {
          token = "new";
          settled = true;
        }))
        .use(async (ctx, next) => {
          tries++;
          return next(ctx);
        })
        .use(authBearer(() => token));

      await assert.rejects(api.get("/a", { signal: controller.signal }), (err: unknown) => err instanceof CanceledError);
      assert.strictEqual(tries, 1);
      assert.strictEqual(sent.length, 1);
    });

    it("rejects a signal without listener methods that a middleware before it passes on, before refreshing", async () => {
      let refreshes = 0;
      // Faxios checks the request's own signal; this one only middleware can introduce.
      const listenerless = { aborted: false } as unknown as AbortSignal;
      const api = faxios.create({ baseURL: BASE })
        .use(async (ctx, next) => next({ ...ctx, config: { ...ctx.config, signal: listenerless } }))
        .use(refreshAuth(() => {
          refreshes++;
        }))
        // Stands in for a 401 from the API.
        .use(async ctx => {
          throw new FaxiosError("Unauthorized", FaxiosError.ERR_BAD_REQUEST, ctx.config, null, { status: 401 } as never);
        });

      await assert.rejects(api.get("/a"), isCode(FaxiosError.ERR_BAD_OPTION_VALUE));
      assert.strictEqual(refreshes, 0);
    });
  });

  describe("refreshAuth: false", () => {
    it("lets the refresh call go through the same instance", async () => {
      let token = "old";
      const sent: Array<string> = [];
      const fetch = async (input: Request | string | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        sent.push(`${url} ${new Headers(init?.headers).get("authorization")}`);
        if (url.endsWith("/auth/refresh")) return Response.json({ access_token: "new" });
        return new Response(null, { status: new Headers(init?.headers).get("authorization") === "Bearer new" ? 200 : 401 });
      };
      const api = faxios.create({ baseURL: BASE, env: { fetch } })
        .use(refreshAuth(async () => {
          const { data } = await api.post<{ access_token: string; }>("/auth/refresh", null, { refreshAuth: false });
          token = data.access_token;
        }))
        .use(authBearer(() => token));

      assert.strictEqual((await api.get("/me")).status, 200);
      assert.deepStrictEqual(sent, [ `${BASE}/me Bearer old`, `${BASE}/auth/refresh Bearer old`, `${BASE}/me Bearer new` ]);
    });

    it("lets a refresh call through the same instance fail with its 401 instead of waiting on itself", async () => {
      let token = "old";
      let refreshes = 0;
      const { fetch, sent } = server(() => "new");
      const api = faxios.create({ baseURL: BASE, env: { fetch } })
        .use(refreshAuth(async () => {
          refreshes++;
          // The refresh endpoint answers 401 too here; with the opt-out that rejects the refresh.
          await api.post("/auth/refresh", null, { refreshAuth: false });
          token = "new";
        }))
        .use(authBearer(() => token));

      await assert.rejects(api.get("/me"), (err: unknown) => err instanceof FaxiosError && err.config?.url === "/auth/refresh");
      assert.strictEqual(refreshes, 1);
      assert.deepStrictEqual(sent.map(s => s.url), [ `${BASE}/me`, `${BASE}/auth/refresh` ]);
    });

    it("accepts only false", async () => {
      const { fetch, sent } = server(() => "never");
      const api = faxios.create({ baseURL: BASE, env: { fetch } }).use(refreshAuth(() => {}));

      // @ts-expect-error TS2769 -- only false turns refreshing off
      await assert.rejects(api.get("/a", { refreshAuth: true }), isCode(FaxiosError.ERR_BAD_OPTION_VALUE));
      assert.strictEqual(sent.length, 0);
    });
  });

  it("rejects invalid options when the plugin is created", () => {
    const refresh = () => {};
    // @ts-expect-error TS2345 -- refresh must be a function
    assert.throws(() => refreshAuth("nope"), isCode(FaxiosError.ERR_BAD_OPTION_VALUE));
    assert.throws(() => refreshAuth(refresh, { statuses: [ 99 ] }), isCode(FaxiosError.ERR_BAD_OPTION_VALUE));
    // @ts-expect-error TS2322 -- refreshOn is a function
    assert.throws(() => refreshAuth(refresh, { refreshOn: true }), isCode(FaxiosError.ERR_BAD_OPTION_VALUE));
    assert.throws(() => refreshAuth(refresh, { origins: [ "https://api.test/v1" ] }), isCode(FaxiosError.ERR_BAD_OPTION_VALUE));
    // @ts-expect-error TS2353 -- unknown option
    assert.throws(() => refreshAuth(refresh, { methods: [ "get" ] }), isCode(FaxiosError.ERR_BAD_OPTION));
  });
});
