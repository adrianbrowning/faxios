// The shape of results/size.json and results/runtime.json. The scripts check what they write, and
// the tests check the committed files, so the report can rely on it.
import { z } from "zod";

const client = z.enum([ "fetch", "axios", "faxios" ]);
const stage = z.enum([ "basic", "validated", "retry" ]);
const bytes = z.number().int()
  .nonnegative();
const ms = z.number().nonnegative();

export const metaSchema = z.object({
  date: z.iso.datetime(),
  // The commit the packed faxios was built from, and whether packages/lib had uncommitted changes.
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  libDirty: z.boolean(),
  platform: z.object({
    os: z.string(),
    release: z.string(),
    arch: z.string(),
    cpu: z.string(),
    cores: z.number().int()
      .positive(),
    memoryGiB: z.number().positive(),
  }),
  runtime: z.object({ name: z.literal("node"), version: z.string() }),
  versions: z.record(z.string(), z.string()),
});

const sizesSchema = z.object({ raw: bytes, minified: bytes, gzip: bytes, brotli: bytes });

export const sizeResultsSchema = z.object({
  meta: metaSchema,
  bundler: z.object({ format: z.literal("esm"), platform: z.literal("browser"), target: z.string() }),
  dependencies: z.array(z.object({ name: z.string(), label: z.string(), sizes: sizesSchema })),
  scenarios: z.array(z.object({
    name: z.string(),
    label: z.string(),
    client,
    stage,
    sizes: sizesSchema,
    // Informational only: non-blank, non-comment lines of the fixture source, not a score.
    sourceLines: z.number().int()
      .positive(),
  })),
});

export const runtimeResultsSchema = z.object({
  meta: metaSchema,
  options: z.object({ timeMs: ms, warmupTimeMs: ms, concurrency: z.literal(1) }),
  results: z.array(z.object({
    mode: z.enum([ "memory", "server" ]),
    stage,
    client,
    // "fetch" for every primary result; Axios's default Node adapter is a secondary result.
    transport: z.enum([ "fetch", "axios-http" ]),
    secondary: z.boolean(),
    samples: z.number().int()
      .positive(),
    attemptsPerOp: z.number().positive(),
    latencyMs: z.object({ mean: ms, p50: ms, p95: ms, p99: ms, min: ms, max: ms }),
    rmePercent: z.number().nonnegative(),
    opsPerSecond: z.number().positive(),
  })),
});

export type SizeResults = z.infer<typeof sizeResultsSchema>;
export type RuntimeResults = z.infer<typeof runtimeResultsSchema>;
export type Meta = z.infer<typeof metaSchema>;
