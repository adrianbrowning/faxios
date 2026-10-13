// The bundles the size report measures. .size-limit.ts and scripts/size.ts both read this list.

export type Client = "axios" | "faxios" | "fetch";
export type Stage = "basic" | "retry" | "validated";
export type Measure = "brotli" | "gzip" | "minified" | "raw";

export type Entry = {
  // Dependency-only bundles hold just the import; scenario bundles hold a whole fixture.
  kind: "dependency" | "scenario";
  label: string;
  name: string;
  path: string;
} & ({ client: Client; stage: Stage; } | { client?: undefined; stage?: undefined; });

export const CLIENTS: ReadonlyArray<Client> = [ "fetch", "axios", "faxios" ];
export const STAGES: ReadonlyArray<Stage> = [ "basic", "validated", "retry" ];
export const MEASURES: ReadonlyArray<Measure> = [ "raw", "minified", "gzip", "brotli" ];

export const CLIENT_LABELS: Record<Client, string> = { fetch: "Native Fetch", axios: "Axios", faxios: "faxios" };
export const STAGE_LABELS: Record<Stage, string> = {
  basic: "Basic JSON request",
  validated: "Validated endpoint",
  retry: "Validated endpoint with retries",
};

export const ENTRIES: ReadonlyArray<Entry> = [
  { kind: "dependency", name: "dep-faxios", label: "faxios (root import)", path: "fixtures/deps/faxios.ts" },
  { kind: "dependency", name: "dep-faxios-retry", label: "faxios + plugins/retry", path: "fixtures/deps/faxios-retry.ts" },
  { kind: "dependency", name: "dep-axios", label: "Axios (root import)", path: "fixtures/deps/axios.ts" },
  { kind: "dependency", name: "dep-schemas", label: "Shared zod schemas", path: "fixtures/schemas.ts" },
  ...STAGES.flatMap(stage => CLIENTS.map(client => ({
    kind: "scenario" as const,
    name: `${client}-${stage}`,
    label: `${CLIENT_LABELS[client]}: ${STAGE_LABELS[stage]}`,
    path: `fixtures/${client}/${stage}.ts`,
    client,
    stage,
  }))),
];
