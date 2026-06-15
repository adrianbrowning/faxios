import utils from "../utils.js";

const callbackify = (fn, reducer) => utils.isAsyncFn(fn)
  ? function (...args) {
    const cb = args.pop();
     
    fn.apply(this, args).then(value => {
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
