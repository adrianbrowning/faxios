import assert from "node:assert";
import { describe, it } from "vitest";
import faxios from "#src/index.ts";
import FaxiosHeaders, { defineHeaderShortcuts } from "#src/lib/core/FaxiosHeaders.js";

// The get/set/has<Header> shortcuts FaxiosHeaders declares, without its index signature.
type DeclaredHeaderAccessor = keyof {
  [K in keyof FaxiosHeaders as K extends "get" | "getSetCookie" | "has" | "set"
    ? never
    : K extends `${"get" | "has" | "set"}${string}` ? K : never]: true;
};

describe("FaxiosHeaders", () => {
  it("should support headers argument", () => {
    const headers = new FaxiosHeaders({
      x: 1,
      y: 2,
    });

    assert.strictEqual(headers.get("x"), "1");
    assert.strictEqual(headers.get("y"), "2");
  });

  describe("set", () => {
    it("should support adding a single header", () => {
      const headers = new FaxiosHeaders();

      headers.set("foo", "bar");

      assert.strictEqual(headers.get("foo"), "bar");
    });

    it("should support adding multiple headers", () => {
      const headers = new FaxiosHeaders();

      headers.set({
        foo: "value1",
        bar: "value2",
      });

      assert.strictEqual(headers.get("foo"), "value1");
      assert.strictEqual(headers.get("bar"), "value2");
    });

    it("should support adding multiple headers from raw headers string", () => {
      const headers = new FaxiosHeaders();

      headers.set(`foo:value1\nbar:value2`);

      assert.strictEqual(headers.get("foo"), "value1");
      assert.strictEqual(headers.get("bar"), "value2");
    });

    it("should not rewrite header the header if the value is false", () => {
      const headers = new FaxiosHeaders();

      headers.set("foo", "value1");

      headers.set("foo", "value2", false);

      assert.strictEqual(headers.get("foo"), "value1");

      headers.set("foo", "value2");

      assert.strictEqual(headers.get("foo"), "value2");

      headers.set("foo", "value3", true);

      assert.strictEqual(headers.get("foo"), "value3");
    });

    it("should not rewrite the header if its value is false, unless rewrite options is set to true", () => {
      const headers = new FaxiosHeaders();

      headers.set("foo", false);
      headers.set("foo", "value2");

      assert.strictEqual(headers.get("foo"), false);

      headers.set("foo", "value2", true);

      assert.strictEqual(headers.get("foo"), "value2");
    });

    it("should support iterables as a key-value source object", () => {
      const headers = new FaxiosHeaders();

      headers.set(new Map([[ "x", "123" ]]));

      assert.strictEqual(headers.get("x"), "123");
    });

    it("should not merge Object.prototype values into iterable headers", () => {
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.prototype,
        "Authorization"
      );
      (Object.prototype as Record<string, unknown>)["Authorization"] = "polluted";

      try {
        const headers = new FaxiosHeaders(new Map([[ "Authorization", "real" ]]));

        assert.strictEqual(headers.get("authorization"), "real");
      }
      finally {
        descriptor
          // eslint-disable-next-line no-extend-native -- restores the descriptor the test saved
          ? Object.defineProperty(Object.prototype, "Authorization", descriptor)
          : delete (Object.prototype as Record<string, unknown>)["Authorization"];
      }
    });

    it("should support objects with an own iterator as a key-value source object", () => {
      const headers = new FaxiosHeaders();

      headers.set({
        *[Symbol.iterator]() {
          yield [ "x", "123" ] as const;
        },
      });

      assert.strictEqual(headers.get("x"), "123");
    });

    it("should not use inherited Symbol.iterator as a key-value source object", () => {
      try {
        (Object.prototype as any)[Symbol.iterator] = function* () {
          yield [ "x-app", "changed" ];
          yield [ "x-injected", "yes" ];
        };

        const headers = new FaxiosHeaders({
          "x-app": "safe",
        });

        assert.strictEqual(headers.get("x-app"), "safe");
        assert.strictEqual(headers.get("x-injected"), undefined);
      }
      finally {
        delete (Object.prototype as any)[Symbol.iterator];
      }
    });

    it("should not read polluted Object.prototype Symbol.iterator accessors", () => {
      let accessed = false;

      try {
        // eslint-disable-next-line no-extend-native -- prototype-pollution test; removed in finally
        Object.defineProperty(Object.prototype, Symbol.iterator, {
          configurable: true,
          get() {
            accessed = true;
            throw new Error("polluted iterator accessor");
          },
        });

        const headers = new FaxiosHeaders({
          "x-app": "safe",
        });

        assert.strictEqual(headers.get("x-app"), "safe");
        assert.strictEqual(accessed, false);
      }
      finally {
        delete (Object.prototype as any)[Symbol.iterator];
      }
    });

    it("should not consume an inherited Symbol.iterator for non-plain header sources", () => {
      try {
        (Object.prototype as any)[Symbol.iterator] = function* () {
          yield [ "x-injected", "yes" ];
          yield [ "authorization", "Bearer CHANGED" ];
        };

        // A class instance and an Object.create(...) object both have a direct
        // prototype other than Object.prototype, yet their only iterator comes
        // from the polluted Object.prototype — they must not be iterated.
        class HeaderBag {
          [key: string]: string;
          constructor() {
            this["authorization"] = "Bearer VALID";
          }
        }

        const fromClass = new FaxiosHeaders(new HeaderBag());
        assert.strictEqual(fromClass.get("x-injected"), undefined);
        assert.notStrictEqual(fromClass.get("authorization"), "Bearer CHANGED");

        const created = Object.create({ "x-app": "safe" });
        created["authorization"] = "Bearer VALID";
        const fromCreate = new FaxiosHeaders(created);
        assert.strictEqual(fromCreate.get("x-injected"), undefined);
        assert.notStrictEqual(
          fromCreate.get("authorization"),
          "Bearer CHANGED"
        );
      }
      finally {
        delete (Object.prototype as any)[Symbol.iterator];
      }
    });

    it(
      "should support setting multiple header values from an iterable source",
      () => {
        const headers = new FaxiosHeaders();
        const nativeHeaders = new Headers();

        nativeHeaders.append("set-cookie", "foo");
        nativeHeaders.append("set-cookie", "bar");
        nativeHeaders.append("set-cookie", "baz");
        nativeHeaders.append("y", "qux");

        headers.set(nativeHeaders);

        assert.deepStrictEqual(headers.get("set-cookie"), [
          "foo",
          "bar",
          "baz",
        ]);
        assert.strictEqual(headers.get("y"), "qux");
      }
    );

    it("should sanitize invalid characters in header value", () => {
      const headers = new FaxiosHeaders();

      headers.set("x-test", "\t safe\r\nInjected: true \u0000");

      assert.strictEqual(headers.get("x-test"), "safeInjected: true");
    });

    it("should sanitize invalid characters in any array header value", () => {
      const headers = new FaxiosHeaders();

      headers.set("set-cookie", [ "safe=1", " \tunsafe=1\nInjected: true\r\n " ]);

      assert.deepStrictEqual(headers.get("set-cookie"), [
        "safe=1",
        "unsafe=1Injected: true",
      ]);
    });

    // Regression: array normalization must recurse per-element (matching the
    // JS source), so falsey/non-string elements pass through instead of being
    // stringified to "false"/"null".
    it("should recursively normalize non-string array header elements", () => {
      const headers = new FaxiosHeaders();

      // A JavaScript caller can pass any array; the types allow string arrays only.
      headers.set("x-multi", [ "a", false, null, 1 ] as unknown as Array<string>);

      assert.deepStrictEqual(headers.get("x-multi"), [ "a", false, null, "1" ]);
    });

    // Regression: https://github.com/axios/axios/issues/10849
    // Non-control Unicode header values must round-trip through set/get so
    // middleware can encode them (e.g. encodeURIComponent) before
    // the adapter sanitizes to byte-safe values at send time.
    it("should preserve non-control Unicode characters in header values", () => {
      const headers = new FaxiosHeaders();

      headers.set("x-name", "请求用户");

      assert.strictEqual(headers.get("x-name"), "请求用户");
    });

    it("should preserve non-control Unicode characters in array header values", () => {
      const headers = new FaxiosHeaders();

      headers.set("x-names", [ "请求用户", "naïve", "プロジェクト" ]);

      assert.deepStrictEqual(headers.get("x-names"), [
        "请求用户",
        "naïve",
        "プロジェクト",
      ]);
    });

    it("should still strip CR/LF from Unicode header values to prevent header injection", () => {
      const headers = new FaxiosHeaders();

      headers.set("x-name", "请求\r\nInjected: true用户");

      assert.strictEqual(headers.get("x-name"), "请求Injected: true用户");
    });

    // Regression: https://github.com/axios/axios/issues/6959
    it("should silently skip empty header names", () => {
      const headers = new FaxiosHeaders();

      assert.doesNotThrow(() => headers.set("", "a"));
      assert.doesNotThrow(() => headers.set("   ", "b"));
      assert.doesNotThrow(() =>
        headers.set({ "": "c", "   ": "d", foo: "bar" })
      );
      assert.doesNotThrow(() =>
        headers.set(
          new Map([
            [ "", "e" ],
            [ "   ", "f" ],
            [ "x", "y" ],
          ])
        )
      );

      assert.strictEqual(headers.has(""), false);
      assert.strictEqual(headers.get("foo"), "bar");
      assert.strictEqual(headers.get("x"), "y");
      assert.strictEqual(Object.keys(headers).length, 2);
    });
  });

  it("should support uppercase name mapping for names overlapped by class methods", () => {
    const headers = new FaxiosHeaders({
      set: "foo",
    });

    headers.set("get", "bar");

    assert.strictEqual(headers.get("Set"), "foo");
    assert.strictEqual(headers.get("Get"), "bar");
  });

  it("does not let normalize() store a trimmed method name over the method", () => {
    const headers = new FaxiosHeaders({ "set ": "x" });

    headers.normalize(false);

    assert.strictEqual(Object.hasOwn(headers, "set"), false);
    assert.strictEqual(typeof headers.set, "function");
    assert.strictEqual(headers.get("set"), "x");
  });

  it("keeps config.headers.set a method for a request header named \"set \"", async () => {
    const api = faxios.create({ env: { fetch: async () => new Response("ok") } });

    const response = await api.get("http://localhost/x", { headers: { "set ": "x" } });
    const headers = response.config.headers;

    assert.strictEqual(Object.hasOwn(headers, "set"), false);
    headers.set("x-after", "1");
    assert.strictEqual(headers.get("x-after"), "1");
  });

  describe("get", () => {
    describe("filter", () => {
      it("should support RegExp", () => {
        const headers = new FaxiosHeaders();

        headers.set("foo", "bar=value1");

        assert.strictEqual((headers.get("foo", /^bar=(\w+)/) as RegExpMatchArray)[1], "value1");
        assert.strictEqual(headers.get("foo", /^foo=/), null);
      });

      it("should support function", () => {
        const headers = new FaxiosHeaders();

        headers.set("foo", "bar=value1");

        assert.strictEqual(
          headers.get("foo", (value, header) => {
            assert.strictEqual(value, "bar=value1");
            assert.strictEqual(header, "foo");
            return value;
          }),
          "bar=value1"
        );
        assert.strictEqual(
          headers.get("foo", () => false),
          false
        );
      });
    });
  });

  describe("has", () => {
    it("should return true if the header is defined, otherwise false", () => {
      const headers = new FaxiosHeaders();

      headers.set("foo", "bar=value1");

      assert.strictEqual(headers.has("foo"), true);
      assert.strictEqual(headers.has("bar"), false);
    });

    describe("filter", () => {
      it("should support RegExp", () => {
        const headers = new FaxiosHeaders();

        headers.set("foo", "bar=value1");

        assert.strictEqual(headers.has("foo", /^bar=(\w+)/), true);
        assert.strictEqual(headers.has("foo", /^foo=/), false);
      });

      it("should support function", () => {
        const headers = new FaxiosHeaders();

        headers.set("foo", "bar=value1");

        assert.strictEqual(
          headers.has("foo", (value, header) => {
            assert.strictEqual(value, "bar=value1");
            assert.strictEqual(header, "foo");
            return true;
          }),
          true
        );
        assert.strictEqual(
          headers.has("foo", () => false),
          false
        );
      });

      it("should support string pattern", () => {
        const headers = new FaxiosHeaders();

        headers.set("foo", "bar=value1");

        assert.strictEqual(headers.has("foo", "value1"), true);
        assert.strictEqual(headers.has("foo", "value2"), false);
      });
    });
  });

  describe("delete", () => {
    it("should delete the header", () => {
      const headers = new FaxiosHeaders();

      headers.set("foo", "bar=value1");

      assert.strictEqual(headers.has("foo"), true);

      headers.delete("foo");

      assert.strictEqual(headers.has("foo"), false);
    });

    it("should return true if the header has been deleted, otherwise false", () => {
      const headers = new FaxiosHeaders();

      headers.set("foo", "bar=value1");

      assert.strictEqual(headers.delete("bar"), false);

      assert.strictEqual(headers.delete("foo"), true);
    });

    it("should support headers array", () => {
      const headers = new FaxiosHeaders();

      headers.set("foo", "x");
      headers.set("bar", "y");
      headers.set("baz", "z");

      assert.strictEqual(headers.delete([ "foo", "baz" ]), true);

      assert.strictEqual(headers.has("foo"), false);
      assert.strictEqual(headers.has("bar"), true);
      assert.strictEqual(headers.has("baa"), false);
    });

    it("doesn't bring a deleted header back through a copy or normalize()", () => {
      const headers = new FaxiosHeaders();
      headers.set("X-Gone", "a\r\nb");
      headers.set("X-Kept", "k");

      headers.delete("x-gone");

      assert.strictEqual(new FaxiosHeaders(headers).has("X-Gone"), false);
      assert.strictEqual(FaxiosHeaders.concat(headers).has("X-Gone"), false);
      assert.strictEqual(headers.normalize(true).has("X-Gone"), false);
      assert.deepStrictEqual(Object.keys(headers.toJSON()), [ "X-Kept" ]);
    });

    describe("filter", () => {
      it("should support RegExp", () => {
        const headers = new FaxiosHeaders();

        headers.set("foo", "bar=value1");

        assert.strictEqual(headers.has("foo"), true);

        headers.delete("foo", /baz=/);

        assert.strictEqual(headers.has("foo"), true);

        headers.delete("foo", /bar=/);

        assert.strictEqual(headers.has("foo"), false);
      });

      it("should support function", () => {
        const headers = new FaxiosHeaders();

        headers.set("foo", "bar=value1");

        headers.delete("foo", (value, header) => {
          assert.strictEqual(value, "bar=value1");
          assert.strictEqual(header, "foo");
          return false;
        });

        assert.strictEqual(headers.has("foo"), true);

        assert.strictEqual(
          headers.delete("foo", () => true),
          true
        );

        assert.strictEqual(headers.has("foo"), false);
      });

      it("should support string pattern", () => {
        const headers = new FaxiosHeaders();

        headers.set("foo", "bar=value1");

        assert.strictEqual(headers.has("foo"), true);

        headers.delete("foo", "baz");

        assert.strictEqual(headers.has("foo"), true);

        headers.delete("foo", "bar");

        assert.strictEqual(headers.has("foo"), false);
      });
    });
  });

  describe("clear", () => {
    it("should clear all headers", () => {
      const headers = new FaxiosHeaders({ x: 1, y: 2 });

      headers.clear();

      assert.deepStrictEqual({ ...headers.toJSON() }, {});
    });

    it("should clear matching headers if a matcher was specified", () => {
      const headers = new FaxiosHeaders({ foo: 1, "x-foo": 2, bar: 3 });

      assert.deepStrictEqual(
        { ...headers.toJSON() },
        { foo: "1", "x-foo": "2", bar: "3" }
      );

      headers.clear(/^x-/);

      assert.deepStrictEqual({ ...headers.toJSON() }, { foo: "1", bar: "3" });
    });
  });

  describe("toJSON", () => {
    it("should return headers object with original headers case", () => {
      const headers = new FaxiosHeaders({
        Foo: "x",
        bAr: "y",
      });

      assert.deepStrictEqual(
        { ...headers.toJSON() },
        {
          Foo: "x",
          bAr: "y",
        }
      );
    });
  });

  describe("accessors", () => {
    // A subclass, so the shortcuts land on its prototype and not on the shared FaxiosHeaders one.
    it("adds get, set and has shortcuts for a header", () => {
      class Headers extends FaxiosHeaders {}
      defineHeaderShortcuts(Headers.prototype, [ "foo" ]);
      const headers = new Headers({ foo: 1 }) as unknown as Record<string, (...args: Array<unknown>) => unknown>;

      assert.strictEqual(headers["getFoo"]!(), "1");
      assert.strictEqual(headers["hasFoo"]!(), true);
      headers["setFoo"]!(2);
      assert.strictEqual(headers["getFoo"]!(), "2");
      assert.strictEqual(Object.hasOwn(FaxiosHeaders.prototype, "getFoo"), false);
    });

    it("registers a header once when the shortcut builder runs twice", () => {
      class Headers extends FaxiosHeaders {}
      defineHeaderShortcuts(Headers.prototype, [ "X-Once" ]);
      const first: unknown = Object.getOwnPropertyDescriptor(Headers.prototype, "getXOnce")?.value;
      defineHeaderShortcuts(Headers.prototype, [ "x-once" ]);

      assert.strictEqual(typeof first, "function");
      assert.strictEqual(Object.getOwnPropertyDescriptor(Headers.prototype, "getXOnce")?.value, first);
    });

    it("is not a public static on FaxiosHeaders", () => {
      assert.strictEqual("accessor" in FaxiosHeaders, false);
    });

    it("should register every shortcut FaxiosHeaders declares", () => {
      // `satisfies` makes tsc reject this object unless its keys are exactly the declared shortcuts.
      const declared = {
        getContentType: true,
        setContentType: true,
        hasContentType: true,
        getContentLength: true,
        setContentLength: true,
        hasContentLength: true,
        getAccept: true,
        setAccept: true,
        hasAccept: true,
        getAcceptEncoding: true,
        setAcceptEncoding: true,
        hasAcceptEncoding: true,
        getUserAgent: true,
        setUserAgent: true,
        hasUserAgent: true,
        getAuthorization: true,
        setAuthorization: true,
        hasAuthorization: true,
      } satisfies Record<DeclaredHeaderAccessor, true>;
      const headers = new FaxiosHeaders();

      for (const name of Object.keys(declared)) {
        assert.strictEqual(typeof headers[name], "function", `${name} is declared but not registered`);
      }
    });
  });

  it("should be caseless", () => {
    const headers = new FaxiosHeaders({
      fOo: 1,
    });

    assert.strictEqual(headers.get("Foo"), "1");
    assert.strictEqual(headers.get("foo"), "1");

    headers.set("foo", 2);

    assert.strictEqual(headers.get("foO"), "2");
    assert.strictEqual(headers.get("fOo"), "2");

    assert.strictEqual(headers.has("fOo"), true);

    headers.delete("FOO");

    assert.strictEqual(headers.has("fOo"), false);
  });

  describe("normalize()", () => {
    it("should support auto-formatting", () => {
      const headers = new FaxiosHeaders({
        fOo: 1,
        "x-foo": 2,
        "y-bar-bAz": 3,
      });

      assert.deepStrictEqual(
        { ...headers.normalize(true).toJSON() },
        {
          Foo: "1",
          "X-Foo": "2",
          "Y-Bar-Baz": "3",
        }
      );
    });

    it("should support external defined values", () => {
      const headers = new FaxiosHeaders({
        foo: "1",
      });

      headers.Foo = 2;
      headers.bar = 3;

      assert.deepStrictEqual(
        { ...headers.normalize().toJSON() },
        {
          foo: "2",
          bar: "3",
        }
      );
    });

    it("should support array values", () => {
      // A JavaScript caller can pass number arrays; the types allow string arrays only.
      const headers = new FaxiosHeaders({
        foo: [ 1, 2, 3 ] as unknown as Array<string>,
      });

      assert.deepStrictEqual(
        { ...headers.normalize().toJSON() },
        {
          foo: [ "1", "2", "3" ],
        }
      );
    });
  });

  describe("FaxiosHeaders.concat", () => {
    it("should concatenate plain headers into an FaxiosHeader instance", () => {
      const a = { a: 1 };
      const b = { b: 2 };
      const c = { c: 3 };
      const headers = FaxiosHeaders.concat(a, b, c);

      assert.deepStrictEqual(
        { ...headers.toJSON() },
        {
          a: "1",
          b: "2",
          c: "3",
        }
      );
    });

    it("should concatenate raw headers into an FaxiosHeader instance", () => {
      const a = "a:1\nb:2";
      const b = "c:3\nx:4";
      const headers = FaxiosHeaders.concat(a, b);

      assert.deepStrictEqual(
        { ...headers.toJSON() },
        {
          a: "1",
          b: "2",
          c: "3",
          x: "4",
        }
      );
    });

    it("should concatenate Faxios headers into a new FaxiosHeader instance", () => {
      const a = new FaxiosHeaders({ x: 1 });
      const b = new FaxiosHeaders({ y: 2 });
      const headers = FaxiosHeaders.concat(a, b);

      assert.deepStrictEqual(
        { ...headers.toJSON() },
        {
          x: "1",
          y: "2",
        }
      );
    });
  });

  describe("toString", () => {
    it("should serialize FaxiosHeader instance to a raw headers string", () => {
      assert.deepStrictEqual(
        new FaxiosHeaders({ x: 1, y: 2 }).toString(),
        "x: 1\ny: 2"
      );
    });
  });

  describe("getSetCookie", () => {
    it("should return set-cookie", () => {
      const headers = new FaxiosHeaders(
        "Set-Cookie: key=val;\n" + "Set-Cookie: key2=val2;\n"
      );

      assert.deepStrictEqual(headers.getSetCookie(), [
        "key=val;",
        "key2=val2;",
      ]);
    });

    it("should return empty set-cookie", () => {
      assert.deepStrictEqual(new FaxiosHeaders().getSetCookie(), []);
    });
  });

  describe("dangerous header names", () => {
    const input = () => JSON.parse("{\"__proto__\":[\"x\"],\"constructor\":\"c\",\"prototype\":\"p\",\"x-ok\":\"1\"}") as Record<string, string>;

    for (const [ name, make ] of [
      [ "from", () => FaxiosHeaders.from(input()) ],
      [ "constructor", () => new FaxiosHeaders(input()) ],
      [ "set", () => new FaxiosHeaders().set(input()) ],
    ] as const) {
      it(`${name} skips __proto__, constructor and prototype and keeps other headers`, () => {
        const h = make();

        assert.strictEqual(Object.getPrototypeOf(h), FaxiosHeaders.prototype);
        assert.strictEqual(typeof h.get, "function");
        assert.strictEqual(h.get("x-ok"), "1");
        assert.deepStrictEqual(Object.keys(h), [ "x-ok" ]);
      });
    }

    it("a request with headers from JSON.parse keeps its other headers", async () => {
      let sent: Headers | undefined;
      const fetch = async (_input: Request | string | URL, init?: RequestInit) => {
        sent = new Headers(init?.headers);
        return new Response(null, { status: 200 });
      };

      await faxios.create({ env: { fetch } }).get("http://localhost/h", { headers: input() });

      assert.strictEqual(sent?.get("x-ok"), "1");
    });
  });

  it("sends request config headers given as a Headers or a Map, on the request and on create()", async () => {
    let sent: Headers | undefined;
    const fetch = async (_input: Request | string | URL, init?: RequestInit) => {
      sent = new Headers(init?.headers);
      return new Response(null, { status: 200 });
    };

    await faxios.create({ env: { fetch } }).get("http://localhost/h", { headers: new Headers({ "X-A": "1" }) });
    assert.strictEqual(sent?.get("x-a"), "1");
    await faxios.create({ env: { fetch } }).get("http://localhost/h", { headers: new Map([[ "X-B", "2" ]]) });
    assert.strictEqual(sent?.get("x-b"), "2");
    await faxios.create({ env: { fetch }, headers: new Headers({ "X-C": "3" }) }).get("http://localhost/h");
    assert.strictEqual(sent?.get("x-c"), "3");
  });

  describe("body aliases send request headers given as a Headers, a Map or [name, value] pairs", () => {
    const forms = {
      Headers: () => new Headers({ "X-B": "2" }),
      Map: () => new Map([[ "X-B", "2" ]]),
      pairs: () => [[ "X-B", "2" ]] as Array<[string, string]>,
    };
    const aliases = [ "post", "put", "patch", "query", "postForm", "putForm", "patchForm" ] as const;
    for (const alias of aliases) {
      for (const [ form, make ] of Object.entries(forms)) {
        it(`${alias} with ${form}`, async () => {
          let sent: Headers | undefined;
          const fetch = async (_input: Request | string | URL, init?: RequestInit) => {
            sent = new Headers(init?.headers);
            return new Response(null, { status: 200 });
          };

          await faxios.create({ env: { fetch } })[alias]("http://localhost/h", { a: "1" }, { headers: make() });

          assert.strictEqual(sent?.get("x-b"), "2");
        });
      }
    }
  });
});
