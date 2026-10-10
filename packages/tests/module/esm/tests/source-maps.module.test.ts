import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const suiteRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
// The suite depends on the packed tarball as "faxios" (see package.json).
const packageRoot = fs.realpathSync(path.join(suiteRoot, "node_modules", "faxios"));
const distRoot = path.join(packageRoot, "dist");

const listFiles = (dir: string, suffix: string): Array<string> =>
  fs.readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter(name => name.endsWith(suffix))
    .map(name => path.join(dir, name));

describe("module esm source maps", () => {
  it("ships a .d.ts.map next to every .d.ts", () => {
    const declarations = listFiles(distRoot, ".d.ts");
    expect(declarations.length).toBeGreaterThan(0);
    const missing = declarations.filter(file => !fs.existsSync(`${file}.map`));
    expect(missing).toEqual([]);
  });

  it("resolves every map source to a file inside the installed package", () => {
    const maps = listFiles(distRoot, ".map");
    expect(maps.length).toBeGreaterThan(0);
    const unresolved: Array<string> = [];
    for (const mapFile of maps) {
      const map = JSON.parse(fs.readFileSync(mapFile, "utf8")) as { sourceRoot?: string; sources: Array<string>; };
      expect(map.sources.length).toBeGreaterThan(0);
      for (const source of map.sources) {
        const resolved = path.resolve(path.dirname(mapFile), map.sourceRoot ?? "", source);
        const inside = !path.relative(packageRoot, resolved).startsWith("..");
        if (!inside || !fs.existsSync(resolved)) {
          unresolved.push(`${path.relative(packageRoot, mapFile)} -> ${source}`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("documents pathParams in the shipped types", () => {
    const types = fs.readFileSync(path.join(distRoot, "lib", "types.d.ts"), "utf8");
    expect(types).toMatch(/\/\*\*(?:(?!\*\/)[\s\S])*\{key\}(?:(?!\*\/)[\s\S])*\*\/\s*pathParams\?:/);
  });
});
