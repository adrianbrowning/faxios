import type { Rule } from "eslint";

type Call = Parameters<NonNullable<Rule.RuleListener["CallExpression"]>>[0];

const isAbortEvent = (arg: Call["arguments"][number] | undefined) =>
  arg?.type === "Literal" && arg.value === "abort";

const methodName = (node: Call) =>
  node.callee.type === "MemberExpression" && node.callee.property.type === "Identifier"
    ? node.callee.property.name
    : undefined;

// An `{ signal }` option removes the listener when that signal aborts.
const removedBySignalOption = (options: Call["arguments"][number] | undefined) =>
  options?.type === "ObjectExpression" &&
  options.properties.some(p =>
    p.type === "Property" && p.key.type === "Identifier" && p.key.name === "signal");

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Every abort listener added with addEventListener must be removed with removeEventListener on settlement or cancellation (AGENTS.md: Cancellation).",
    },
    schema: [],
    messages: {
      inline: "This abort listener is an inline function, so it can never be removed. Name it and call `removeEventListener(\"abort\", fn)` on settlement and cancellation.",
      leaked: "Abort listener `{{handler}}` is never removed. Call `removeEventListener(\"abort\", {{handler}})` on settlement and cancellation.",
    },
  },
  create(context) {
    const added: Array<{ node: Call; handler: string; }> = [];
    const removed = new Set<string>();

    return {
      CallExpression(node) {
        const method = methodName(node);
        if (method !== "addEventListener" && method !== "removeEventListener") return;
        const [ type, handler, options ] = node.arguments;
        if (!isAbortEvent(type) || handler === undefined) return;
        const handlerText = context.sourceCode.getText(handler);
        if (method === "removeEventListener") {
          removed.add(handlerText);
          return;
        }
        if (removedBySignalOption(options)) return;
        if (handler.type === "ArrowFunctionExpression" || handler.type === "FunctionExpression") {
          context.report({ node, messageId: "inline" });
          return;
        }
        added.push({ node, handler: handlerText });
      },
      "Program:exit"() {
        for (const { node, handler } of added) {
          if (!removed.has(handler)) context.report({ node, messageId: "leaked", data: { handler } });
        }
      },
    };
  },
};

export default rule;
