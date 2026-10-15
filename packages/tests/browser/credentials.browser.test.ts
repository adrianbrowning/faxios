import { describe, expect, it } from "vitest";

import faxios from "#src/index.js";

import { installFetchMock } from "./helpers/fetchMock.js";

describe("withCredentials -> fetch credentials (vitest browser)", () => {
  const cases: Array<[string, { withCredentials?: boolean | string; }, RequestCredentials]> = [
    [ "unset", {}, "same-origin" ],
    [ "false", { withCredentials: false }, "same-origin" ],
    [ "true", { withCredentials: true }, "include" ],
    [ "a string", { withCredentials: "omit" }, "omit" ],
  ];

  cases.forEach(([ label, config, expected ]) => {
    it(`sends credentials "${expected}" when withCredentials is ${label}`, async () => {
      using mock = installFetchMock();

      await faxios("/foo", config as { withCredentials?: boolean; });

      expect(mock.lastRequest!.credentials).toBe(expected);
    });
  });
});
