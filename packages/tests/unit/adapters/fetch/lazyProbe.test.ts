import { afterEach, describe, expect, it, vi } from "vitest";

describe("fetch adapter probes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("probes the runtime on the first getFetch() call, not at import", async () => {
    let constructed = 0;
    vi.stubGlobal("Request", class extends Request {
      constructor(...args: ConstructorParameters<typeof Request>) {
        super(...args);
        constructed++;
      }
    });
    vi.resetModules();
    // Dynamic import: the test needs a fresh evaluation of fetch.ts after the stub is in place.
    const { getFetch } = await import("#src/lib/adapters/fetch.js");
    expect(constructed).toBe(0);

    const adapter = getFetch();
    expect(typeof adapter).toBe("function");
    expect(constructed).toBeGreaterThan(0);

    const probes = constructed;
    expect(getFetch()).toBe(adapter);
    expect(constructed).toBe(probes);
  });
});
