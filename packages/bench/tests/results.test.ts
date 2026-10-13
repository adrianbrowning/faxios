// The size and runtime reports: every fixture has a bundle, Size Limit sets no limit, the committed
// results have the shape the report reads, and the committed docs page is the one they render to.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sizeLimitChecks from "../.size-limit.ts";
import { CLIENTS, ENTRIES, MEASURES, STAGES } from "../scripts/entries.ts";
import { page } from "../scripts/render.ts";
import { runtimeResultsSchema, sizeResultsSchema } from "../scripts/results-schema.ts";

const benchDir = new URL("../", import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, benchDir), "utf8"));

describe("size entries", () => {
  it("bundle every fixture and dependency file that exists", () => {
    for (const entry of ENTRIES) expect(existsSync(new URL(entry.path, benchDir)), entry.path).toBe(true);
    const scenarios = ENTRIES.filter(entry => entry.kind === "scenario").map(entry => entry.path);
    expect(scenarios.toSorted()).toEqual(CLIENTS.flatMap(client => STAGES.map(stage => `fixtures/${client}/${stage}.ts`)).toSorted());
  });

  it("measure each entry four ways, with no limit to fail on", () => {
    expect(sizeLimitChecks.map(check => check.name)).toEqual(ENTRIES.flatMap(entry => MEASURES.map(measure => `${entry.name} ${measure}`)));
    for (const check of sizeLimitChecks) expect(check).not.toHaveProperty("limit");
  });
});

describe("committed results", () => {
  it("size.json has a bundle per client and stage", () => {
    const size = sizeResultsSchema.parse(readJson("results/size.json"));
    expect(size.scenarios.map(s => `${s.client} ${s.stage}`).toSorted())
      .toEqual(CLIENTS.flatMap(client => STAGES.map(stage => `${client} ${stage}`)).toSorted());
  });

  it("runtime.json has every client and stage in both modes, with the expected attempts", () => {
    const runtime = runtimeResultsSchema.parse(readJson("results/runtime.json"));
    const primary = runtime.results.filter(r => !r.secondary);
    expect(primary.map(r => `${r.mode} ${r.stage} ${r.client}`).toSorted())
      .toEqual([ "memory", "server" ].flatMap(mode => STAGES.flatMap(stage => CLIENTS.map(client => `${mode} ${stage} ${client}`))).toSorted());
    for (const result of primary) expect(result.attemptsPerOp).toBe(result.stage === "retry" ? 3 : 1);
    expect(runtime.results.filter(r => r.secondary).map(r => [ r.mode, r.stage, r.client, r.transport ]))
      .toEqual([ [ "server", "basic", "axios", "axios-http" ] ]);
  });

  it("render to the committed docs page", () => {
    expect(readFileSync(new URL("../docs/pages/misc/comparison.md", benchDir), "utf8")).toBe(page);
  });
});
