// Runtime benchmark: every fixture, one request at a time, against an in-memory fetch double
// (client work only) and a local HTTP server in a worker thread (the runtime's whole fetch stack).
// Writes results/runtime.json. Each task is checked for the right result before it is timed, and
// its attempts per operation are checked after, so a fixture can't win by skipping work.
// Usage: node scripts/runtime.ts   (BENCH_TIME_MS and BENCH_WARMUP_MS override the budgets)
import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { Bench } from "tinybench";
import { createBasic as axiosBasic } from "../fixtures/axios/basic.ts";
import { createRetrying as axiosRetrying } from "../fixtures/axios/retry.ts";
import { createValidated as axiosValidated } from "../fixtures/axios/validated.ts";
import { createBasic as faxiosBasic } from "../fixtures/faxios/basic.ts";
import { createRetrying as faxiosRetrying } from "../fixtures/faxios/retry.ts";
import { createValidated as faxiosValidated } from "../fixtures/faxios/validated.ts";
import { createBasic as fetchBasic } from "../fixtures/fetch/basic.ts";
import { createRetrying as fetchRetrying } from "../fixtures/fetch/retry.ts";
import { createValidated as fetchValidated } from "../fixtures/fetch/validated.ts";
import type { GetUserInput } from "../fixtures/schemas.ts";
import type { FixtureOptions, RetryPolicy } from "../fixtures/types.ts";
import type { Client, Stage } from "./entries.ts";
import { collectMeta } from "./meta.ts";
import { runtimeResultsSchema } from "./results-schema.ts";
import type { RuntimeResults } from "./results-schema.ts";
import { createResponder, FAILURES_BEFORE_SUCCESS, USER_BODY } from "./workload.ts";

const TIME_MS = Number(process.env["BENCH_TIME_MS"] ?? 1000);
const WARMUP_MS = Number(process.env["BENCH_WARMUP_MS"] ?? 250);

const QUERY: GetUserInput["query"] = { fields: "summary", limit: 10 };
const WIRE = JSON.parse(USER_BODY) as Record<string, unknown>;
const PARSED = { ...WIRE, createdAt: new Date(WIRE["createdAt"] as string) };
// Orchestration only: no waits and no jitter, so the retry stage measures the retry logic and the
// two extra round trips. The waits themselves are covered by the retry tests.
const BENCH_RETRY: RetryPolicy = { delay: 0, jitter: "none" };

type Mode = RuntimeResults["results"][number]["mode"];
type Transport = RuntimeResults["results"][number]["transport"];

type Task = {
  client: Client;
  expected: unknown;
  run: () => Promise<unknown>;
  secondary: boolean;
  stage: Stage;
  transport: Transport;
};

type GetUser = (input: GetUserInput) => Promise<unknown>;

const FIXTURES: Record<Client, {
  basic: (options: FixtureOptions) => { getUser: (id: string) => Promise<unknown>; };
  retry: (options: FixtureOptions & { retry: RetryPolicy; }) => { getUser: GetUser; };
  validated: (options: FixtureOptions) => { getUser: GetUser; };
}> = {
  fetch: { basic: fetchBasic, validated: fetchValidated, retry: fetchRetrying },
  axios: { basic: axiosBasic, validated: axiosValidated, retry: axiosRetrying },
  faxios: { basic: faxiosBasic, validated: faxiosValidated, retry: faxiosRetrying },
};

function tasksFor(options: FixtureOptions, mode: Mode): Array<Task> {
  let retryId = 0;
  const primary = (Object.keys(FIXTURES) as Array<Client>).flatMap((client): Array<Task> => {
    const fixtures = FIXTURES[client];
    const basic = fixtures.basic(options);
    const validated = fixtures.validated(options);
    const retrying = fixtures.retry({ ...options, retry: BENCH_RETRY });
    const shared = { client, secondary: false, transport: "fetch" as const };
    return [
      { ...shared, stage: "basic", expected: WIRE, run: () => basic.getUser("u1") },
      { ...shared, stage: "validated", expected: PARSED, run: () => validated.getUser({ path: { id: "u1" }, query: QUERY }) },
      // A fresh id per operation, so each one sees two 503s then the user.
      { ...shared, stage: "retry", expected: PARSED, run: () => retrying.getUser({ path: { id: `retry-${retryId++}` }, query: QUERY }) },
    ];
  });
  if (mode === "memory") return primary;
  // Secondary: Axios on its default Node adapter, a different transport from the other three.
  const axiosHttp = axiosBasic({ ...options, adapter: "http" });
  return [ ...primary, { client: "axios", stage: "basic", transport: "axios-http", secondary: true, expected: WIRE, run: () => axiosHttp.getUser("u1") } ];
}

// Nearest-rank percentile of samples sorted ascending.
const percentile = (sorted: ReadonlyArray<number>, p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? 0;

async function measure(mode: Mode, tasks: Array<Task>, attempts: () => number): Promise<RuntimeResults["results"]> {
  const results: RuntimeResults["results"] = [];
  for (const task of tasks) {
    const name = `${mode} ${task.stage} ${task.client}${task.secondary ? ` (${task.transport})` : ""}`;
    // eslint-disable-next-line no-await-in-loop -- tasks run one after another, never together
    deepStrictEqual(await task.run(), task.expected, `${name}: wrong result`);
    let ops = 0;
    const before = attempts();
    const bench = new Bench({ name, time: TIME_MS, warmupTime: WARMUP_MS, retainSamples: true, throws: true });
    bench.add(name, async () => {
      ops++;
      await task.run();
    });
    // eslint-disable-next-line no-await-in-loop -- see above
    await bench.run();
    const result = bench.tasks[0]?.result;
    if (result?.state !== "completed") throw new Error(`${name}: ${result?.state ?? "no result"}`);
    const attemptsPerOp = (attempts() - before) / ops;
    strictEqual(attemptsPerOp, task.stage === "retry" ? FAILURES_BEFORE_SUCCESS + 1 : 1, `${name}: attempts per operation`);
    const { latency, throughput } = result;
    const samples = latency.samples ?? [];
    results.push({
      mode,
      stage: task.stage,
      client: task.client,
      transport: task.transport,
      secondary: task.secondary,
      samples: latency.samplesCount,
      attemptsPerOp,
      latencyMs: {
        mean: latency.mean,
        p50: latency.p50,
        p95: percentile(samples, 0.95),
        p99: latency.p99,
        min: latency.min,
        max: latency.max,
      },
      rmePercent: latency.rme,
      opsPerSecond: throughput.mean,
    });
    console.log(`${name.padEnd(44)} median ${latency.p50.toFixed(4)}ms  p95 ${percentile(samples, 0.95).toFixed(4)}ms  ${latency.samplesCount} samples`);
  }
  return results;
}

async function inMemory() {
  const respond = createResponder();
  let attempts = 0;
  // Every client gets the same double: no network, so only client work is left to measure.
  const fetch: typeof globalThis.fetch = async input => {
    attempts++;
    const url = input instanceof Request ? input.url : String(input);
    const status = respond(new URL(url).pathname);
    return new Response(status === 200 ? USER_BODY : "{\"message\":\"unavailable\"}", { status, headers: { "content-type": "application/json" } });
  };
  return measure("memory", tasksFor({ baseURL: "http://bench.local", fetch }, "memory"), () => attempts);
}

async function localServer() {
  const counter = new SharedArrayBuffer(4);
  const worker = new Worker(new URL("server-worker.ts", import.meta.url), { workerData: counter });
  try {
    const { promise, resolve, reject } = Promise.withResolvers<number>();
    worker.once("message", resolve);
    worker.once("error", reject);
    const port = await promise;
    const requests = new Int32Array(counter);
    return await measure("server", tasksFor({ baseURL: `http://127.0.0.1:${port}` }, "server"), () => Atomics.load(requests, 0));
  }
  finally {
    worker.postMessage("close");
    await worker.terminate();
  }
}

const output: RuntimeResults = runtimeResultsSchema.parse({
  meta: collectMeta(),
  options: { timeMs: TIME_MS, warmupTimeMs: WARMUP_MS, concurrency: 1 },
  results: [ ...await inMemory(), ...await localServer() ],
});
writeFileSync(new URL("../results/runtime.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log("wrote results/runtime.json");
