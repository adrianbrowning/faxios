import utils from "../utils.js";

const callbackify = (fn: (...args: Array<unknown>) => unknown, reducer?: (value: unknown) => Array<unknown>) => utils.isAsyncFn(fn)
  ? function (this: unknown, ...args: Array<unknown>) {
    const cb = args.pop() as (err: unknown, ...vals: Array<unknown>) => void;

    (fn.apply(this, args) as Promise<unknown>).then(value => {
      try {
        // eslint-disable-next-line promise/no-callback-in-promise
        reducer ? cb(null, ...reducer(value)) : cb(null, value);
      }
      catch (err) {
        // eslint-disable-next-line promise/no-callback-in-promise
        cb(err);
      }
      return null;
    }, cb);
  }
  : fn;

export default callbackify;
