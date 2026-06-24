import assert from "node:assert";
import { beforeEach, describe, it } from "vitest";
import adapters from "../../../src/lib/adapters/adapters.js";
import type { InternalFaxiosRequestConfig } from "../../../src/lib/types.js";

const store = { ...adapters.adapters } as Record<string, unknown>;
const adapterStore = adapters.adapters as Record<string, unknown>;
const config = {} as InternalFaxiosRequestConfig;

describe("adapters", () => {
  beforeEach(() => {
    Object.keys(adapterStore).forEach(name => {
      delete adapterStore[name];
    });

    Object.assign(adapterStore, store);
  });

  it("should support loading by fn handle", () => {
    const adapter = () => {};
    assert.strictEqual(adapters.getAdapter(adapter, config), adapter);
  });

  it("should support loading by name", () => {
    const adapter = () => {};
    adapterStore.testadapter = adapter;
    assert.strictEqual(adapters.getAdapter("testAdapter", config), adapter);
  });

  it("should detect adapter unavailable status", () => {
    adapterStore.testadapter = null;
    assert.throws(
      () => adapters.getAdapter("testAdapter", config),
      /is not available in the build/
    );
  });

  it("should detect adapter unsupported status", () => {
    adapterStore.testadapter = false;
    assert.throws(
      () => adapters.getAdapter("testAdapter", config),
      /is not supported by the environment/
    );
  });

  it("should pick suitable adapter from the list", () => {
    const adapter = () => {};

    Object.assign(adapterStore, {
      foo: false,
      bar: null,
      baz: adapter,
    });

    assert.strictEqual(adapters.getAdapter([ "foo", "bar", "baz" ], config), adapter);
  });
});
