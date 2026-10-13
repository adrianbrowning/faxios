import type { Rule, Scope } from "eslint";

type Node = Rule.Node;

// Calls that bind a port, checked in these spots:
//   startHTTPServer(handler, { port: 8010 })   `port` in any object argument
//   Bun.serve({ port: 8010 }), Deno.serve(...)  same
//   server.listen(8010) / listen({ port: 8010 }) first argument, or its `port`
// A port is fixed when it is a number literal other than 0, or an identifier bound by
// `const PORT = 8010` in scope. Ports computed at runtime (parameters, env, arithmetic)
// aren't checked.

const portProperty = (node: Node) => {
  if (node.type !== "ObjectExpression") return undefined;
  for (const property of node.properties) {
    if (property.type === "Property" && !property.computed && property.key.type === "Identifier" &&
      property.key.name === "port") return property.value as Node;
  }
  return undefined;
};

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Test servers must bind port 0, so parallel test runs (other worktrees, agents, local services) don't collide.",
    },
    schema: [],
    messages: {
      fixed: "Port {{port}} is fixed, so a second test run at the same time fails with EADDRINUSE. Use port 0 and read the bound port from `server.address()`.",
    },
  },
  create(context) {
    const { sourceCode } = context;

    const findVariable = (node: Node, name: string) => {
      for (let scope: null | Scope.Scope = sourceCode.getScope(node); scope; scope = scope.upper) {
        const found = scope.set.get(name);
        if (found) return found;
      }
      return undefined;
    };

    // The fixed port number `node` evaluates to, if any.
    const fixedPort = (node: Node): number | undefined => {
      if (node.type === "Literal") return typeof node.value === "number" && node.value !== 0 ? node.value : undefined;
      if (node.type !== "Identifier") return undefined;
      const definition = findVariable(node, node.name)?.defs[0];
      if (definition?.type !== "Variable" || definition.parent.kind !== "const") return undefined;
      const { init } = definition.node;
      return init ? fixedPort(init as Node) : undefined;
    };

    const report = (node: Node | undefined) => {
      if (node === undefined) return;
      const port = fixedPort(node);
      if (port !== undefined) context.report({ node, messageId: "fixed", data: { port: String(port) } });
    };

    return {
      CallExpression(node) {
        const { callee } = node;
        const args = node.arguments as Array<Node>;
        if (callee.type === "Identifier") {
          if (callee.name === "startHTTPServer") for (const argument of args) report(portProperty(argument));
          return;
        }
        if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return;
        const method = callee.property.name;
        if (method === "listen") {
          const [ first ] = args;
          if (first) report(portProperty(first) ?? first);
        }
        else if (method === "serve" && callee.object.type === "Identifier" &&
          (callee.object.name === "Bun" || callee.object.name === "Deno")) {
          for (const argument of args) report(portProperty(argument));
        }
      },
    };
  },
};

export default rule;
