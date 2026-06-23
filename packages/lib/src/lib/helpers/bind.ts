"use strict";

/**
 * Create a bound version of a function with a specified `this` context
 *
 * @param {Function} fn - The function to bind
 * @param {*} thisArg - The value to be passed as the `this` parameter
 * @returns {Function} A new function that will call the original function with the specified `this` context
 */
export default function bind<T extends (...args: never[]) => unknown>(fn: T, thisArg: unknown): (...args: Parameters<T>) => ReturnType<T> {
  return function wrap(...args: Parameters<T>): ReturnType<T> {
    return fn.apply(thisArg, args) as ReturnType<T>;
  };
}
