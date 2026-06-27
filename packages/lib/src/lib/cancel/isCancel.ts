"use strict";

export default function isCancel(value: unknown): boolean {
  return !!(value && (value as Record<string, unknown>).__CANCEL__);
}
