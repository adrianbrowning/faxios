import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RuleTester } from "eslint";
import type { Linter, Rule } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { pluginImports, rootRuntimeExports } from "../../../lib/eslint-rules/plugin-imports.ts";

RuleTester.describe = describe;
RuleTester.it = it;

// The built-in plugins' import rule, as packages/lib lints src/lib/plugins/ with it.
const [ , options ] = pluginImports.rules!["@typescript-eslint/no-restricted-imports"] as [Linter.RuleSeverity, unknown];
const rule = pluginImports.plugins!["@typescript-eslint"]!.rules!["no-restricted-imports"] as Rule.RuleModule;

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, ecmaVersion: "latest", sourceType: "module" } });

ruleTester.run("plugin imports", rule, {
  valid: [
    { name: "types from the root", code: "import type { FaxiosPlugin } from \"../../index.js\";", options: [ options ] },
    { name: "a file in plugins/", code: "import { own } from \"./shared.js\";", options: [ options ] },
    { name: "a default export the root re-exports", code: "import FaxiosError from \"../core/FaxiosError.js\";", options: [ options ] },
    { name: "a named export the root re-exports", code: "import { isSchemaValidationError } from \"../core/FaxiosError.js\";", options: [ options ] },
  ],
  invalid: [
    { name: "a runtime value from the root", code: "import { FaxiosError } from \"../../index.js\";", options: [ options ], errors: 1 },
    { name: "a module the root doesn't re-export", code: "import { hasOwnProp } from \"../utils.js\";", options: [ options ], errors: 1 },
    { name: "a private named export of mergeConfig.js", code: "import { mergeConfigExceptHeaders } from \"../core/mergeConfig.js\";", options: [ options ], errors: 1 },
    { name: "a private named export of FaxiosHeaders.js", code: "import { defineHeaderShortcuts } from \"../core/FaxiosHeaders.js\";", options: [ options ], errors: 1 },
    { name: "a private named export of toFormData.js", code: "import { DEFAULT_FORM_DATA_MAX_DEPTH } from \"../helpers/toFormData.js\";", options: [ options ], errors: 1 },
    { name: "a namespace import of a re-exported module", code: "import * as headers from \"../core/FaxiosHeaders.js\";", options: [ options ], errors: 1 },
  ],
});

describe("rootRuntimeExports", () => {
  it("lists the runtime values src/index.ts re-exports, by module", () => {
    const index = readFileSync(resolve(import.meta.dirname, "../../../lib/src/index.ts"), "utf8");
    const reExports: Record<string, Array<string>> = {};
    for (const [ , names, module ] of index.matchAll(/^export \{([^}]+)\} from "\.\/lib\/(.+)\.ts";$/gm)) {
      // `default as Cancel, default as CanceledError` re-exports one name twice.
      reExports[`../${module!}.js`] = [ ...new Set(names!.split(",").map(name => name.trim().split(" as ")[0]!)) ];
    }
    expect(rootRuntimeExports).toStrictEqual(reExports);
  });
});
