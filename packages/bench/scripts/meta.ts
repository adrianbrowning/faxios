// What every result records: when, on what machine, with which versions, from which commit.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import os from "node:os";
import { pathToFileURL } from "node:url";
import type { Meta } from "./results-schema.ts";

const benchDir = new URL("../", import.meta.url);

// The installed version, read from the package directory: some packages don't export package.json.
function installedVersion(packageDir: URL): string {
  return (JSON.parse(readFileSync(new URL("package.json", packageDir), "utf8")) as { version: string; }).version;
}

const git = (...args: Array<string>) => execFileSync("git", args, { cwd: benchDir, encoding: "utf8" }).trim();

export function collectMeta(): Meta {
  const installed = (name: string) => installedVersion(new URL(`node_modules/${name}/`, benchDir));
  // esbuild is Size Limit's bundler: a dependency of its esbuild plugin, installed beside it.
  const esbuildPlugin = pathToFileURL(`${realpathSync(new URL("node_modules/@size-limit/esbuild", benchDir))}/`);
  const cpus = os.cpus();
  return {
    date: new Date().toISOString(),
    commit: git("rev-parse", "HEAD"),
    libDirty: git("status", "--porcelain", "--", "../lib") !== "",
    platform: {
      os: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpu: cpus[0]?.model.trim() ?? "unknown",
      cores: cpus.length,
      memoryGiB: Math.round(os.totalmem() / 2 ** 30),
    },
    runtime: { name: "node", version: process.versions.node },
    versions: {
      "@gcmdev/faxios": installed("faxios"),
      "axios": installed("axios"),
      "zod": installed("zod"),
      "size-limit": installed("size-limit"),
      "@size-limit/esbuild": installed("@size-limit/esbuild"),
      "esbuild": installedVersion(new URL("../../esbuild/", esbuildPlugin)),
      "tinybench": installed("tinybench"),
    },
  };
}
