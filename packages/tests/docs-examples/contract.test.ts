import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { REQUEST_CONFIG_KEYS } from "#src/lib/core/assertRequestConfig.ts";
import { publicExports } from "./contract.ts";
import { extractBlocks } from "./extract.ts";

const pages = join(import.meta.dirname, "../../docs/pages/advanced");
const read = (page: string) => readFileSync(join(pages, page), "utf8");

describe("API reference", () => {
  it("documents every export of the package root", () => {
    const reference = read("api-reference.md");
    // A heading for the export, or its row in a table such as the Types list.
    const documented = (name: string) => new RegExp(`^(?:#{2,4} .*\`${name}\`|\\| \`${name}\` \\|)`, "m").test(reference);
    const rootExports = publicExports().get("@gcmdev/faxios")!.filter(name => name !== "default");

    expect(rootExports.filter(name => !documented(name))).toEqual([]);
  });
});

describe("Request config page", () => {
  const page = read("request-config.md");
  const keys = Object.keys(REQUEST_CONFIG_KEYS).sort();

  it("has a ### section for every request config key, and none for anything else", () => {
    const sections = [ ...page.matchAll(/^### `(\w+)`/gm) ].map(match => match[1]).sort();

    expect(sections).toEqual(keys);
  });

  it("sets every request config key in the full request config example", () => {
    const example = /## Full request config example\n\n```ts\n([\s\S]*?)\n```/.exec(page)?.[1] ?? "";
    // The example's top-level keys are indented two spaces.
    const set = new Set([ ...example.matchAll(/^ {2}(\w+):/gm) ].map(match => match[1]));

    expect(keys.filter(key => !set.has(key))).toEqual([]);
  });
});

describe("contract blocks", () => {
  const outName = ".generated-contract-test";
  const outDir = join(import.meta.dirname, outName);
  // Outside outDir, which extractBlocks empties first; `.generated*` directories are ignored by git.
  const sourceDir = join(import.meta.dirname, `${outName}-source`);
  const markdown = join(sourceDir, "page.md");

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });

  // Each block as documented today, and with one detail changed. Only the changed ones may fail.
  const cases = [
    {
      name: "a class member",
      fence: "contract=@gcmdev/faxios#FaxiosHeaders",
      matches: "toJSON(asStrings?: boolean): Record<string, unknown>;",
      differs: "toJSON(asStrings: boolean): Record<string, unknown>;",
    },
    {
      name: "a constructor of a generic class",
      fence: "contract=@gcmdev/faxios#FaxiosError<T,D>",
      matches: "constructor(message: string, code?: string, config?: InternalFaxiosRequestConfig<D>, request?: unknown, response?: FaxiosResponse<T, D>);",
      differs: "constructor(message: string, code?: string, config?: InternalFaxiosRequestConfig<D>, request?: unknown, response?: FaxiosResponse<D, T>);",
    },
    {
      name: "a property of a generic class",
      fence: "contract=@gcmdev/faxios#FaxiosError<T,D>",
      matches: "response?: FaxiosResponse<T, D>;",
      differs: "response?: FaxiosResponse<D, T>;",
    },
    {
      name: "a property that gains readonly",
      fence: "contract=@gcmdev/faxios#FaxiosError<T,D>",
      matches: "response?: FaxiosResponse<T, D>;",
      differs: "readonly response?: FaxiosResponse<T, D>;",
    },
    {
      name: "a property that stops being optional",
      fence: "contract=@gcmdev/faxios#FaxiosError<T,D>",
      matches: "response?: FaxiosResponse<T, D>;",
      differs: "response: FaxiosResponse<T, D> | undefined;",
    },
    {
      name: "a config option that loses ?",
      fence: "contract=@gcmdev/faxios#FaxiosRequestConfig",
      matches: "withXSRFToken?: boolean | undefined | ((config: InternalFaxiosRequestConfig) => boolean | undefined);",
      differs: "withXSRFToken: boolean | undefined | ((config: InternalFaxiosRequestConfig) => boolean | undefined);",
    },
    {
      name: "a static member",
      fence: "contract=@gcmdev/faxios#FaxiosHeaders",
      matches: "type HeaderInput = FaxiosHeaders | Record<string, FaxiosHeaderValue | undefined> | Iterable<readonly [string, FaxiosHeaderValue | undefined]> | Headers | string | null | undefined;\nstatic from(thing?: HeaderInput): FaxiosHeaders;",
      differs: "type HeaderInput = FaxiosHeaders | Record<string, FaxiosHeaderValue | undefined> | Headers | string | null | undefined;\nstatic from(thing?: HeaderInput): FaxiosHeaders;",
    },
    {
      name: "a function export",
      fence: "contract=@gcmdev/faxios",
      matches: "isCancel(value: unknown): value is CanceledError;",
      differs: "isCancel(value: string): value is CanceledError;",
    },
    {
      name: "an instance method alias",
      fence: "contract=@gcmdev/faxios#FaxiosInstance",
      matches: "faxios.getUri(config?: FaxiosRequestConfig): string;",
      differs: "faxios.getUri(config: FaxiosRequestConfig): string;",
    },
    {
      name: "an interface export",
      fence: "contract=@gcmdev/faxios",
      matches: "interface FaxiosContext<TOptions = {}, TCapabilities = {}> {\n  attempt: number;\n  config: InternalFaxiosRequestConfig & TOptions;\n  readonly instanceBaseURL: string | undefined;\n  state: Record<PropertyKey, unknown>;\n  capabilities: TCapabilities;\n}",
      differs: "interface FaxiosContext<TOptions = {}, TCapabilities = {}> {\n  attempt: number;\n  config: InternalFaxiosRequestConfig & TOptions;\n  readonly instanceBaseURL: string | undefined;\n  state: Record<PropertyKey, unknown>;\n  capabilities: TOptions;\n}",
    },
  ];

  it("type-check while they match the shipped declarations, and fail once one detail differs", async () => {
    const blocks = cases.flatMap(({ fence, matches, differs }) => [ matches, differs ].map(code => `\`\`\`ts ${fence}\n${code}\n\`\`\`\n`));
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(markdown, blocks.join("\n"));
    const extracted = extractBlocks([ markdown ], outDir);
    writeFileSync(join(outDir, "tsconfig.json"), JSON.stringify({ extends: "../tsconfig.json", include: [ "./*.ts" ] }));

    const tsc = join(import.meta.dirname, "../node_modules/.bin/tsc");
    const output = await promisify(execFile)(tsc, [ "-p", join(outDir, "tsconfig.json") ]).then(
      ({ stdout }) => stdout,
      (error: { stdout: string; }) => error.stdout
    );
    const tscResult = (file: string) => (output.includes(`${outName}/${file}(`) ? "fails" : "passes");

    const results = cases.map(({ name }, index) => ({
      name,
      matching: tscResult(extracted[index * 2]!.file),
      changed: tscResult(extracted[index * 2 + 1]!.file),
    }));
    expect(results).toEqual(cases.map(({ name }) => ({ name, matching: "passes", changed: "fails" })));
    expect(output).toContain("differs from the shipped declaration");
  }, 60_000);
});
