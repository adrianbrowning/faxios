import type { Rule, Scope } from "eslint";

type Node = Rule.Node;

const HTTP_MODULES = new Set([ "http", "https", "http2" ].flatMap(m => [ m, `node:${m}` ]));
const CREATE_METHODS = new Set([ "createServer", "createSecureServer" ]);
const CLEANUP_HOOKS = new Set([ "afterEach", "afterAll", "onTestFinished" ]);
const TEARDOWN_METHODS = new Set([ "close", "closeAllConnections", "stop", "shutdown" ]);
// Helpers such as stopHTTPServer(server) or a local stopServer(server).
const TEARDOWN_HELPER = /^(stop|close)/u;
// Wrappers that evaluate to the server they wrap.
const PASS_THROUGH = new Set([
  "AwaitExpression", "ConditionalExpression", "LogicalExpression",
  "TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression",
]);

const calleeName = (node: Node) =>
  node.type === "CallExpression" && node.callee.type === "Identifier" ? node.callee.name : undefined;

// ESLint types child properties as plain ESTree nodes but `.parent` as Rule.Node, so the
// type checker sees one runtime object as two unrelated types. Compare identity here.
const same = (a: object | null | undefined, b: object) => a === b;

// Inside a `finally` block, or inside a callback passed to afterEach/afterAll/onTestFinished.
const inCleanup = (node: Node) => {
  for (let child = node, { parent } = node; parent; child = parent, { parent } = parent) {
    if (parent.type === "TryStatement" && same(parent.finalizer, child)) return true;
    if (parent.type === "CallExpression" && !same(parent.callee, child) && CLEANUP_HOOKS.has(calleeName(parent) ?? "")) return true;
  }
  return false;
};

// `stopHTTPServer(server)`, `stopServer(server)`, `server.close()`, `server.stop()`, `server.shutdown()`.
const isTeardown = (ref: Node) => {
  const { parent } = ref;
  if (parent === null) return false;
  if (parent.type === "CallExpression") return !same(parent.callee, ref) && TEARDOWN_HELPER.test(calleeName(parent) ?? "");
  return parent.type === "MemberExpression" && same(parent.object, ref) &&
    parent.property.type === "Identifier" && TEARDOWN_METHODS.has(parent.property.name) &&
    parent.parent.type === "CallExpression" && same(parent.parent.callee, parent);
};

// Returning or resolving the server hands its teardown to the caller.
const handsOff = (node: Node) => {
  const { parent } = node;
  if (parent === null) return false;
  return parent.type === "ReturnStatement" ||
    (parent.type === "ArrowFunctionExpression" && same(parent.body, node)) ||
    (parent.type === "CallExpression" && !same(parent.callee, node) && calleeName(parent) === "resolve");
};

// The expression whose value is the started server: through awaits, casts and `.listen()` chains.
const serverExpression = (start: Node) => {
  let node = start;
  for (let { parent } = node; parent; { parent } = node) {
    if (PASS_THROUGH.has(parent.type)) node = parent;
    else if (parent.type === "MemberExpression" && same(parent.object, node) &&
      parent.property.type === "Identifier" && parent.property.name === "listen" &&
      parent.parent.type === "CallExpression" && same(parent.parent.callee, parent)) node = parent.parent;
    else break;
  }
  return node;
};

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Every test HTTP server must be stopped in `finally` or an afterEach/afterAll hook; leaking servers causes Vitest hangs (AGENTS.md: Tests).",
    },
    schema: [],
    messages: {
      unbound: "This server is never stored, so nothing can stop it. Assign it and stop it in `finally` or afterEach/afterAll.",
      unguarded: "Server `{{name}}` is not stopped in `finally` or afterEach/afterAll, so a failing assertion leaks it.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    const httpNamespaces = new Set<string>();
    const createFunctions = new Set<string>();
    const calls: Array<Node> = [];

    const isStart = (node: Node) => {
      if (node.type !== "CallExpression") return false;
      const { callee } = node;
      if (callee.type === "Identifier") return callee.name === "startHTTPServer" || createFunctions.has(callee.name);
      if (callee.type !== "MemberExpression" || callee.object.type !== "Identifier" || callee.property.type !== "Identifier") return false;
      const [ object, method ] = [ callee.object.name, callee.property.name ];
      return (httpNamespaces.has(object) && CREATE_METHODS.has(method)) ||
        ((object === "Bun" || object === "Deno") && method === "serve");
    };

    const findVariable = (node: Node, name: string) => {
      for (let scope: Scope.Scope | null = sourceCode.getScope(node); scope; scope = scope.upper) {
        const found = scope.set.get(name);
        if (found) return found;
      }
      return undefined;
    };

    const boundVariable = (expression: Node) => {
      const { parent } = expression;
      if (parent?.type === "VariableDeclarator" && parent.id.type === "Identifier") {
        return sourceCode.getDeclaredVariables(parent)[0];
      }
      if (parent?.type === "AssignmentExpression" && parent.left.type === "Identifier") {
        return findVariable(parent, parent.left.name);
      }
      return undefined;
    };

    const check = (start: Node) => {
      const expression = serverExpression(start);
      if (handsOff(expression)) return;
      const declaration = expression.parent?.parent;
      if (declaration?.type === "VariableDeclaration" && (declaration.kind === "using" || declaration.kind === "await using")) return;
      const variable = boundVariable(expression);
      if (variable === undefined) {
        context.report({ node: start, messageId: "unbound" });
        return;
      }
      const reads = variable.references.filter(r => r.isRead()).map(r => r.identifier as Node);
      if (reads.some(ref => (isTeardown(ref) && inCleanup(ref)) || handsOff(ref))) return;
      context.report({ node: start, messageId: "unguarded", data: { name: variable.name } });
    };

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== "string" || !HTTP_MODULES.has(node.source.value)) return;
        for (const spec of node.specifiers) {
          if (spec.type !== "ImportSpecifier") httpNamespaces.add(spec.local.name);
          else if (spec.imported.type === "Identifier" && CREATE_METHODS.has(spec.imported.name)) createFunctions.add(spec.local.name);
        }
      },
      CallExpression(node) {
        calls.push(node);
      },
      "Program:exit"() {
        for (const node of calls) if (isStart(node)) check(node);
      },
    };
  },
};

export default rule;
