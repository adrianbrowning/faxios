"use strict";

// Adds the caller's frames to `rawStack`, the request's error stack. `callerStack` is the stack
// captured where request() rejects, including its "Error" line.
function stitchStack(rawStack: unknown, callerStack: string): unknown {
  const firstNewline = callerStack.indexOf("\n");
  // slice off the Error: ... line
  const stack = firstNewline === -1 ? "" : callerStack.slice(firstNewline + 1);
  if (!rawStack) return stack;
  if (!stack) return rawStack;
  // match without the 2 top stack lines
  const firstNewlineIndex = stack.indexOf("\n");
  const secondNewlineIndex = firstNewlineIndex === -1 ? -1 : stack.indexOf("\n", firstNewlineIndex + 1);
  const stackWithoutTwoTopLines = secondNewlineIndex === -1 ? "" : stack.slice(secondNewlineIndex + 1);
  return String(rawStack).endsWith(stackWithoutTwoTopLines) ? rawStack : rawStack + "\n" + stack;
}

// Formatting a stack is costly, and most rejections are handled without reading it, so the
// caller's frames are captured now and stitched into err.stack only when it is first read.
export default function patchErrorStack(err: Error): void {
  let callerFrames: { stack?: string; } = {};
  // captureStackTrace is V8-only (Node, Chromium) and formats nothing until .stack is read.
  const captureStackTrace = (Error as { captureStackTrace?: (target: object) => void; }).captureStackTrace;
  if (captureStackTrace) {
    captureStackTrace(callerFrames);
  }
  else {
    callerFrames = new Error();
  }

  // V8 keeps an own accessor that formats on first read; elsewhere `stack` may be an own string
  // or an accessor on Error.prototype.
  const own = Object.getOwnPropertyDescriptor(err, "stack");
  if (own && !own.configurable) return;
  const readOriginal = (): unknown => {
    if (!own) return Reflect.get(Object.getPrototypeOf(err) ?? {}, "stack", err);
    return own.get ? own.get.call(err) : own.value;
  };
  const settle = (value: unknown): void => {
    Object.defineProperty(err, "stack", { value, writable: true, enumerable: own?.enumerable ?? false, configurable: true });
  };
  Object.defineProperty(err, "stack", {
    get() {
      const value = stitchStack(readOriginal(), callerFrames.stack ?? "");
      settle(value);
      return value;
    },
    set: settle,
    enumerable: own?.enumerable ?? false,
    configurable: true,
  });
}
