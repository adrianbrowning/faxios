/**
 * Throttle decorator
 * @param {Function} fn
 * @param {Number} freq
 * @return {Function}
 */
function throttle(fn: (...args: Array<unknown>) => void, freq: number): [(...args: Array<unknown>) => void, () => void] {
  let timestamp = 0;
  const threshold = 1000 / freq;
  let lastArgs: Array<unknown> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const invoke = (args: Array<unknown>, now: number = Date.now()) => {
    timestamp = now;
    lastArgs = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    fn(...args);
  };

  const throttled = (...args: Array<unknown>) => {
    const now = Date.now();
    const passed = now - timestamp;
    if (passed >= threshold) {
      invoke(args, now);
    }
    else {
      lastArgs = args;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          invoke(lastArgs!);
        }, threshold - passed);
      }
    }
  };

  const flush = () => { if (lastArgs) invoke(lastArgs); };

  return [ throttled, flush ];
}

export default throttle;
