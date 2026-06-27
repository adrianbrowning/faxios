# Tests

Tester du code qui effectue des requêtes HTTP avec faxios est simple. L'approche recommandée consiste à simuler (mocker) faxios lui-même afin que vos tests s'exécutent sans toucher un vrai réseau, vous donnant un contrôle total sur les réponses que reçoit votre code.

## Simulation avec Vitest ou Jest

Vitest et Jest supportent tous deux la simulation de modules avec `vi.mock` / `jest.mock`. Vous pouvez simuler l'ensemble du module faxios et contrôler ce que chaque méthode retourne :

```js
// user-service.js
import faxios from "faxios";

export async function getUser(id) {
  const { data } = await faxios.get(`/api/users/${id}`);
  return data;
}
```

```js
// user-service.test.js
import { describe, it, expect, vi } from "vitest";
import faxios from "faxios";
import { getUser } from "./user-service";

vi.mock("faxios");

describe("getUser", () => {
  it("returns user data on success", async () => {
    const mockUser = { id: 1, name: "Jay" };

    // Faire en sorte que faxios.get se résolve avec notre fausse réponse
    faxios.get.mockResolvedValueOnce({ data: mockUser });

    const result = await getUser(1);

    expect(result).toEqual(mockUser);
    expect(faxios.get).toHaveBeenCalledWith("/api/users/1");
  });

  it("throws when the request fails", async () => {
    faxios.get.mockRejectedValueOnce(new Error("Network error"));

    await expect(getUser(1)).rejects.toThrow("Network error");
  });
});
```

## Simuler une FaxiosError

Pour tester les chemins de gestion d'erreurs qui inspectent `error.response`, créez directement une instance d'`FaxiosError` :

```js
import faxios, { FaxiosError } from "faxios";
import { vi } from "vitest";

const mockError = new FaxiosError(
  "Not Found",
  "ERR_BAD_REQUEST",
  {},       // config
  {},       // request
  {         // response
    status: 404,
    statusText: "Not Found",
    data: { message: "User not found" },
    headers: {},
    config: {},
  }
);

faxios.get.mockRejectedValueOnce(mockError);
```

## Utiliser faxios-mock-adapter

[faxios-mock-adapter](https://github.com/ctimmerm/faxios-mock-adapter) est une bibliothèque qui installe un adaptateur personnalisé sur votre instance faxios, interceptant les requêtes au niveau de l'adaptateur. Cela signifie que vos intercepteurs continuent de s'exécuter, ce qui la rend plus adaptée aux tests d'intégration.

```bash
npm install --save-dev faxios-mock-adapter
```

```js
import faxios from "faxios";
import MockAdapter from "faxios-mock-adapter";

const mock = new MockAdapter(faxios);

// Simuler une requête GET
mock.onGet("/api/users/1").reply(200, { id: 1, name: "Jay" });

// Simuler une requête POST
mock.onPost("/api/users").reply(201, { id: 2, name: "New User" });

// Simuler une erreur réseau
mock.onGet("/api/failing").networkError();

// Simuler un délai d'attente dépassé
mock.onGet("/api/slow").timeout();
```

Réinitialisez les simulations entre les tests :

```js
afterEach(() => {
  mock.reset(); // effacer tous les gestionnaires enregistrés
});
```

## Tester les intercepteurs

Pour tester les intercepteurs de manière isolée, créez une nouvelle instance faxios dans votre test :

```js
import faxios from "faxios";
import MockAdapter from "faxios-mock-adapter";

describe("auth interceptor", () => {
  it("attaches a Bearer token to every request", async () => {
    const instance = faxios.create();
    const mock = new MockAdapter(instance);

    // Ajoutez votre intercepteur
    instance.interceptors.request.use((config) => {
      config.headers.set("Authorization", "Bearer test-token");
      return config;
    });

    // Capturez la configuration de la requête en inspectant ce que mock a reçu
    let capturedConfig;
    mock.onGet("/api/data").reply((config) => {
      capturedConfig = config;
      return [200, {}];
    });

    await instance.get("/api/data");

    expect(capturedConfig.headers["Authorization"]).toBe("Bearer test-token");
  });
});
```

## Conseils

- Simulez toujours au niveau du module (ou utilisez `MockAdapter`) — évitez de simuler des méthodes individuelles sur une instance partagée, car l'état peut fuiter entre les tests.
- Préférez `mockResolvedValueOnce` / `mockRejectedValueOnce` à `mockResolvedValue` pour que les tests soient isolés et ne s'affectent pas mutuellement.
- Pour tester la logique de nouvelle tentative, utilisez `MockAdapter` afin que l'intercepteur testé s'exécute réellement à chaque tentative.
