import type { Rule } from "eslint";

type Call = Parameters<NonNullable<Rule.RuleListener["CallExpression"]>>[0];

const isAbortEvent = (arg: Call["arguments"][number] | undefined) =>
  arg?.type === "Literal" && arg.value === "abort";

const listenerCall = (node: Call) =>
  node.callee.type === "MemberExpression" && node.callee.property.type === "Identifier"
    ? { method: node.callee.property.name, target: node.callee.object }
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
      leaked: "Abort listener `{{handler}}` on `{{target}}` is never removed. Call `{{target}}.removeEventListener(\"abort\", {{handler}})` on settlement and cancellation.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    const added: Array<{ node: Call; target: string; handler: string; }> = [];
    // A removal only counts for the same target and handler: `a.remove(fn)` does not discharge `b.add(fn)`.
    const removed = new Set<string>();
    const key = (target: string, handler: string) => `${target}\u0000${handler}`;

    return {
      CallExpression(node) {
        const call = listenerCall(node);
        if (call?.method !== "addEventListener" && call?.method !== "removeEventListener") return;
        const [ type, handler, options ] = node.arguments;
        if (!isAbortEvent(type) || handler === undefined) return;
        const target = sourceCode.getText(call.target);
        const handlerText = sourceCode.getText(handler);
        if (call.method === "removeEventListener") {
          removed.add(key(target, handlerText));
          return;
        }
        if (removedBySignalOption(options)) return;
        if (handler.type === "ArrowFunctionExpression" || handler.type === "FunctionExpression") {
          context.report({ node, messageId: "inline" });
          return;
        }
        added.push({ node, target, handler: handlerText });
      },
      "Program:exit"() {
        for (const { node, target, handler } of added) {
          if (!removed.has(key(target, handler))) context.report({ node, messageId: "leaked", data: { target, handler } });
        }
      },
    };
  },
};

export default rule;
