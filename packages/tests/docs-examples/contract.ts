// Turns a declaration-shaped docs block (`contract=` marker, see extract.ts) into a module that
// type-checks only while every declaration in the block matches the shipped one.
//
//   contract=@gcmdev/faxios            the block declares exports of the module: functions, written
//                                      as `name(params): Result;`, or `interface`/`type` declarations
//   contract=@gcmdev/faxios#Name       the block declares members of the export `Name` (a class, an
//                                      interface or an object type): methods, properties,
//                                      `constructor(...)`, `static` members and call signatures
//   contract=@gcmdev/faxios#Name<T,D>  as above, for a generic `Name`; the block uses `T` and `D`
//
// A member line may start with `faxios.` (`faxios.get(...)`), and `faxios(...)` is a call signature.
// A member block may also declare one-line `type Name = ...;` helpers for types the package doesn't
// export by name; later member blocks on the same page can use them too.
// Members and declarations must be identical to the shipped ones, so a parameter, overload or
// result type that changes on either side fails `tsc`. Call signatures (which can't be singled out
// of a type with other members) are compared by assignability in both directions instead.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const libRoot = join(import.meta.dirname, "../../lib");
const PACKAGE = "@gcmdev/faxios";

export type ContractTarget = {
  // The export the block declares members of; undefined when it declares exports of `module`.
  member: string | undefined;
  module: string;
  typeParams: Array<string>;
};

// The package's entry points by import specifier, from the zshy source map in packages/lib/package.json.
function entryPoints(): Map<string, string> {
  const { zshy } = JSON.parse(readFileSync(join(libRoot, "package.json"), "utf8")) as { zshy: { exports: Record<string, string>; }; };
  const entries = new Map<string, string>();
  for (const [ subpath, source ] of Object.entries(zshy.exports)) {
    if (!source.endsWith(".ts")) continue;
    entries.set(subpath === "." ? PACKAGE : `${PACKAGE}/${subpath.slice(2)}`, join(libRoot, source));
  }
  return entries;
}

let exportsCache: Map<string, Array<string>> | undefined;

// Every export name of every entry point, by import specifier, read from the library source with the
// TypeScript checker. Nothing is emitted.
export function publicExports(): Map<string, Array<string>> {
  if (exportsCache) return exportsCache;
  const entries = entryPoints();
  const config = ts.getParsedCommandLineOfConfigFile(join(libRoot, "tsconfig.json"), { noEmit: true }, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: diagnostic => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  });
  if (!config) throw new Error("could not read packages/lib/tsconfig.json");
  const program = ts.createProgram([ ...entries.values() ], config.options);
  const checker = program.getTypeChecker();
  exportsCache = new Map([ ...entries ].map(([ specifier, file ]) => {
    const sourceFile = program.getSourceFile(file);
    const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) throw new Error(`${file} is not a module`);
    return [ specifier, checker.getExportsOfModule(moduleSymbol).map(symbol => symbol.name)
      .sort() ];
  }));
  return exportsCache;
}

// Throws when the value doesn't name an entry point, or an export of it.
export function parseContractTarget(source: string, value: string): ContractTarget {
  const match = /^([^#<>]+)(?:#(\w+)(?:<(\w+(?:,\w+)*)>)?)?$/.exec(value);
  const exportsOf = match && publicExports().get(match[1]!);
  if (!match || !exportsOf) {
    throw new Error(`${source}: contract=${value} must name an entry point (${[ ...publicExports().keys() ].join(", ")}), optionally followed by #Export`);
  }
  const [ , module, member, typeParams ] = match as unknown as [ string, string, string | undefined, string | undefined ];
  if (member !== undefined && !exportsOf.includes(member)) {
    throw new Error(`${source}: contract=${value}: ${module} has no export named ${member}`);
  }
  return { module, member, typeParams: typeParams ? typeParams.split(",") : [] };
}

const PREAMBLE = `type __Equal<A, B> = (<V>() => V extends A ? 1 : 2) extends (<V>() => V extends B ? 1 : 2) ? true : false;
declare function __same<A, B>(check: __Equal<A, B> extends true ? "matches" : "differs from the shipped declaration"): void;
declare function __assignable<A extends B, B>(): void;`;

// `__Probe0`, `__Probe1`, ...: unique types to instantiate generics with, so a type parameter used
// differently on either side shows.
function probeDeclarations(count: number): string {
  return Array.from({ length: count }, (_, index) => `declare const __probe${index}: unique symbol;\ntype __Probe${index} = { readonly [__probe${index}]: ${index}; };`).join("\n");
}

function parseWrapper(code: string): ts.Statement {
  return ts.createSourceFile("contract.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS).statements[0]!;
}

function declarationsCheck(code: string): string {
  const wrapper = `declare namespace __Documented {\n${code}\n}`;
  const namespace = parseWrapper(wrapper) as ts.ModuleDeclaration;
  const body = namespace.body as ts.ModuleBlock;
  let maxParams = 0;
  const checks = body.statements.flatMap(statement => {
    if (!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) {
      throw new Error(`only interface and type declarations can be compared, not: ${statement.getText().split("\n")[0]}`);
    }
    const name = statement.name.text;
    const params = statement.typeParameters ?? [];
    maxParams = Math.max(maxParams, params.length);
    // A constrained parameter gets its constraint, which a probe wouldn't satisfy.
    const args = params.map((param, index) => param.constraint ? `(${param.constraint.getText()})` : `__Probe${index}`);
    const typeArgs = args.length > 0 ? `<${args.join(", ")}>` : "";
    return [ `__same<__Documented.${name}${typeArgs}, __Target.${name}${typeArgs}>("matches");` ];
  });
  return [ wrapper, probeDeclarations(maxParams), ...checks ].join("\n");
}

// One-line `type Name = ...;` aliases at the start of a line are local helpers for the members
// (for a type the package doesn't export); they are not compared. A helper is in scope in its own
// block and in the later contract blocks of the same page, so a page declares each one once.
function isHelperAlias(line: string): boolean {
  return line.startsWith("type ") && line.endsWith(";");
}

// The checks for one documented member. `real` is the shipped type the block declares members of,
// or undefined when the members are exports of the module.
function memberChecks(member: ts.ClassElement | ts.TypeElement, real: string | undefined, probeArgs: string): Array<string> {
  const name = member.name && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) ? member.name.text : undefined;
  const isStatic = ts.canHaveModifiers(member) && (ts.getModifiers(member) ?? []).some(modifier => modifier.kind === ts.SyntaxKind.StaticKeyword);
  const isCallSignature = ts.isCallSignatureDeclaration(member);
  if (!real && (ts.isConstructorDeclaration(member) || isCallSignature || isStatic)) {
    throw new Error(`${member.getText()} needs contract=<module>#<Export>`);
  }
  if (ts.isConstructorDeclaration(member)) {
    // An instantiation expression, so a generic class's parameters are compared with probes too.
    return [ `__same<ConstructorParameters<typeof __Documented${probeArgs}>, ConstructorParameters<typeof ${real}${probeArgs}>>("matches");` ];
  }
  if (isCallSignature) {
    // The shipped type must take every documented call, and the documented calls must satisfy it.
    return [
      `__assignable<${real}${probeArgs}, __Documented${probeArgs}>();`,
      `__assignable<__Documented${probeArgs} & Omit<${real}${probeArgs}, never>, ${real}${probeArgs}>();`,
    ];
  }
  if (name === undefined) throw new Error(`can't compare the member: ${member.getText()}`);
  if (isStatic) return [ `__same<(typeof __Documented)["${name}"], (typeof ${real})["${name}"]>("matches");` ];
  if (real) return [ `__same<__Documented${probeArgs}["${name}"], ${real}${probeArgs}["${name}"]>("matches");` ];
  return [ `__same<__Documented["${name}"], typeof __Target.${name}>("matches");` ];
}

function membersCheck(code: string, target: ContractTarget, pageHelpers: Map<string, string>): string {
  const typeArgs = (names: Array<string>) => (names.length > 0 ? `<${names.join(", ")}>` : "");
  const real = target.member === undefined ? undefined : `__Target.${target.member}`;
  const lines = code.split("\n");
  for (const helper of lines.filter(isHelperAlias)) pageHelpers.set(/^type (\w+)/.exec(helper)![1]!, helper);
  const body = lines
    .filter(line => !isHelperAlias(line))
    .join("\n")
    .replace(/^( *)faxios\./gm, "$1")
    .replace(/^( *)faxios(?=[<(])/gm, "$1")
    // A polymorphic `this` result is the instance the member is read from: the shipped type, when
    // indexed below. `this:` parameters stay.
    .replace(/(?<![\w$.])this\b(?! *:)/g, real ? `${real}${typeArgs(target.typeParams)}` : "this");
  const isClass = /^ *(?:static |constructor\()/m.test(body);
  const params = typeArgs(target.typeParams);
  const wrapper = isClass ? `declare class __Documented${params} {\n${body}\n}` : `interface __Documented${params} {\n${body}\n}`;
  const declaration = parseWrapper(wrapper) as ts.ClassDeclaration | ts.InterfaceDeclaration;

  const probeArgs = typeArgs(Array.from({ length: target.typeParams.length }, (_, index) => `__Probe${index}`));
  const checks = new Set(declaration.members.flatMap(member => memberChecks(member, real, probeArgs)));
  return [ ...pageHelpers.values(), wrapper, probeDeclarations(target.typeParams.length), ...checks ].join("\n");
}

// The module extract.ts writes for a contract block. Every export of the package root and of the
// target module is in scope, as the block's own imports would bring them. `pageHelpers` carries
// the helper aliases of the page's earlier blocks, and gets this block's.
export function contractModule(source: string, code: string, target: ContractTarget, pageHelpers: Map<string, string>): string {
  const exports = publicExports();
  const rootNames = exports.get(PACKAGE)!.filter(name => name !== "default");
  const inRoot = new Set(rootNames);
  const moduleNames = target.module === PACKAGE ? [] : exports.get(target.module)!.filter(name => name !== "default" && !inRoot.has(name));
  // A block for a module (no #Export) with `interface` or `type` declarations declares exports;
  // helper aliases are for member blocks only.
  const declaresTypes = target.member === undefined && /^(?:interface|type)\s/m.test(code);
  let checks: string;
  try {
    checks = declaresTypes ? declarationsCheck(code) : membersCheck(code, target, pageHelpers);
  }
  catch (error) {
    throw new Error(`${source}: ${(error as Error).message}`, { cause: error });
  }
  return [
    `import type { ${rootNames.join(", ")} } from "${PACKAGE}";`,
    ...(moduleNames.length > 0 ? [ `import type { ${moduleNames.join(", ")} } from "${target.module}";` ] : []),
    `import type * as __Target from "${target.module}";`,
    PREAMBLE,
    checks,
  ].join("\n");
}
