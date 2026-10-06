# Testing

Testing code that makes HTTP requests with faxios is straightforward. The recommended approach is to mock faxios itself so that your tests run without hitting a real network, giving you full control over what responses your code receives.

## Mocking with Vitest or Jest

Both Vitest and Jest support module mocking with `vi.mock` / `jest.mock`. You can mock the entire faxios module and control what each method returns (the examples use Vitest):

```js
// user-service.js
import faxios from "@gcmdev/faxios";

/** @param {number} id */
export async function getUser(id) {
  const { data } = await faxios.get(`/api/users/${id}`);
  return data;
}
```

```js check=skip
// user-service.test.js
import { describe, it, expect, vi } from "vitest";
import faxios from "@gcmdev/faxios";
import { getUser } from "./user-service.js";

vi.mock("@gcmdev/faxios");

describe("getUser", () => {
  it("returns user data on success", async () => {
    const mockUser = { id: 1, name: "Jay" };

    // Make faxios.get resolve with our fake response
    vi.mocked(faxios.get).mockResolvedValueOnce({ data: mockUser });

    const result = await getUser(1);

    expect(result).toEqual(mockUser);
    expect(faxios.get).toHaveBeenCalledWith("/api/users/1");
  });

  it("throws when the request fails", async () => {
    vi.mocked(faxios.get).mockRejectedValueOnce(new Error("Network error"));

    await expect(getUser(1)).rejects.toThrow("Network error");
  });
});
```

## Mocking an FaxiosError

To test error-handling paths that inspect `error.response`, create a `FaxiosError` instance and reject the mocked call with it. Pass `{ spy: true }` to `vi.mock` so the real `FaxiosError` class (and `isFaxiosError`) keep working while you override individual methods; a plain `vi.mock` replaces the `FaxiosError` constructor with an empty mock:

```js check=types
import faxios, { FaxiosError } from "@gcmdev/faxios";
import { vi } from "vitest";

vi.mock("@gcmdev/faxios", { spy: true });

// Only the response fields your code reads are needed.
const mockError = Object.assign(new FaxiosError("Not Found", "ERR_BAD_REQUEST"), {
  response: {
    status: 404,
    statusText: "Not Found",
    data: { message: "User not found" },
    headers: {},
  },
});

vi.mocked(faxios.get).mockRejectedValueOnce(mockError);
```

## Mocking the network with `env.fetch`

faxios sends every request through `fetch`, and the `env.fetch` option replaces the function it calls. Pass a fake `fetch` that returns a `Response` to test the full request pipeline (config merging, middleware, transforms, schema validation and error handling) without a server:

```js
import faxios from "@gcmdev/faxios";

/** @param {unknown} body */
const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const api = faxios.create({
  baseURL: "https://api.example.com",
  env: {
    fetch: async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/users/1")) return jsonResponse({ id: 1, name: "Jay" });
      return jsonResponse({ message: "Not Found" }, 404);
    },
  },
});

const { data } = await api.get("/users/1"); // { id: 1, name: "Jay" }
```

A non-2xx `Response` rejects with a `FaxiosError` whose `response.status` is the mocked status. To simulate a network failure, make the fake `fetch` throw a `TypeError`, as the real `fetch` does.

## Testing middleware

To test [middleware](/pages/advanced/middleware) or a plugin in isolation, install it on a fresh instance in your test with `.use()` and capture what reaches `fetch`:

```js check=types
import { describe, it, expect } from "vitest";
import faxios from "@gcmdev/faxios";

/** @type {import("@gcmdev/faxios").FaxiosMiddleware} */
const authHeader = async (ctx, next) => {
  ctx.config.headers.set("Authorization", "Bearer test-token");
  return next(ctx);
};

describe("auth middleware", () => {
  it("attaches a Bearer token to every request", async () => {
    /** @type {Request | undefined} */
    let captured;
    const instance = faxios.create({
      env: {
        fetch: async (input, init) => {
          captured = new Request(input, init);
          return new Response("{}", { headers: { "Content-Type": "application/json" } });
        },
      },
    }).use(authHeader);

    await instance.get("https://api.example.com/data");

    expect(captured?.headers.get("Authorization")).toBe("Bearer test-token");
  });
});
```

Each `create()` starts with no middleware, so one test's middleware never reaches another's instance.

## Tips

- Always mock at the module level (or pass a fake `env.fetch`): avoid mocking individual methods on a shared instance, as state can leak between tests.
- Use `mockResolvedValueOnce` / `mockRejectedValueOnce` in preference to `mockResolvedValue` so that tests are isolated and don't affect one another.
- When testing retry logic, use a fake `env.fetch` so that the retry middleware under test actually runs on each attempt.
