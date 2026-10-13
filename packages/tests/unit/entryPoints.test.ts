import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

// What each public entry point pulls into a consumer's bundle. esbuild bundles a consumer module
// against the library source and its metafile lists every module the bundle loaded, so a module
// that is absent here can't reach the consumer's bundle however it tree-shakes.
const libDir = new URL("../../lib/", import.meta.url).pathname;

const FORM_MODULES = [
  "src/lib/helpers/toFormData.ts",
  "src/lib/helpers/formDataToJSON.ts",
  "src/lib/helpers/toURLEncodedForm.ts",
  "src/lib/helpers/FaxiosURLSearchParams.ts",
];
const SCHEMA_MODULES = [ "src/lib/core/validateSchema.ts" ];
// The module that builds the root default instance and attaches the axios-compat statics.
const DEFAULT_INSTANCE_MODULES = [ "src/index.ts", "src/lib/faxios.ts" ];

async function bundledModules(consumer: string): Promise<Array<string>> {
  const result = await build({
    stdin: { contents: consumer, resolveDir: libDir, loader: "ts" },
    absWorkingDir: libDir,
    bundle: true,
    format: "esm",
    platform: "neutral",
    metafile: true,
    write: false,
    logLevel: "silent",
  });
  return Object.keys(result.metafile.inputs);
}

describe("entry point import graphs", () => {
  it("should leave form, schema and the default instance out of a GET on ./core", async () => {
    const modules = await bundledModules(`
      import { create } from "./src/core.ts";
      await create().get("https://example.com/");
    `);

    expect(modules).toContain("src/lib/core/dispatchRequest.ts");
    for (const module of [ ...FORM_MODULES, ...SCHEMA_MODULES, ...DEFAULT_INSTANCE_MODULES ]) {
      expect(modules).not.toContain(module);
    }
  });

  // Every published subpath except the root and the unsafe/* internals: plugins, ./core, ./schema
  // and ./form must work without the root default instance.
  const { zshy } = JSON.parse(readFileSync(new URL("package.json", `file://${libDir}`), "utf8")) as { zshy: { exports: Record<string, string>; }; };
  const subpaths = Object.entries(zshy.exports)
    .filter(([ key, source ]) => key !== "." && !key.startsWith("./unsafe/") && source.endsWith(".ts"));

  it.each(subpaths)("should leave the default instance out of %s", async (_subpath, source) => {
    const modules = await bundledModules(`export * from ${JSON.stringify(source)};`);

    expect(modules).toContain(source.replace(/^\.\//, ""));
    for (const module of DEFAULT_INSTANCE_MODULES) {
      expect(modules).not.toContain(module);
    }
  });

  it("should load the form and schema modules and the default instance from the root", async () => {
    const modules = await bundledModules(`export { default } from "./src/index.ts";`);

    for (const module of [ ...FORM_MODULES, ...SCHEMA_MODULES, ...DEFAULT_INSTANCE_MODULES ]) {
      expect(modules).toContain(module);
    }
  });
});
