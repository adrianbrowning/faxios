"use strict";

// utils is a library of generic helper functions non-specific to faxios

const { toString } = Object.prototype;
const { getPrototypeOf } = Object;
const { iterator, toStringTag } = Symbol;

const hasOwnProperty = (obj: unknown, prop: PropertyKey) => Object.hasOwn(obj as object, prop);

/**
 * Walk the prototype chain (excluding the shared Object.prototype) looking for
 * an own `prop`. This distinguishes genuine own/inherited members — including
 * class accessors and template prototypes — from members injected via
 * Object.prototype pollution (e.g. `Object.prototype.username = '...'`), which
 * live on Object.prototype itself and are therefore never matched.
 *
 * @param {*} thing The value whose chain to inspect
 * @param {string|symbol} prop The property key to look for
 *
 * @returns {boolean} True when `prop` is owned below Object.prototype
 */
const hasOwnInPrototypeChain = (thing: unknown, prop: PropertyKey): boolean => {
  let obj: object | null = thing != null && typeof thing === "object" ? thing : null;
  if (obj === null) return false;
  const seen: Array<object> = [];

  while (obj != null && obj !== Object.prototype) {
    if (seen.indexOf(obj) !== -1) {
      return false;
    }
    seen.push(obj);

    if (hasOwnProperty(obj, prop)) {
      return true;
    }
    obj = getPrototypeOf(obj) as object | null;
  }
  return false;
};

/**
 * Read `obj[prop]` only when it is safe from Object.prototype pollution. Own
 * properties and members inherited from a non-Object.prototype source (a class
 * instance or template object) are honored; a value reachable only through a
 * polluted Object.prototype is ignored and `undefined` is returned.
 *
 * @param {*} obj The source object
 * @param {string|symbol} prop The property key to read
 *
 * @returns {*} The resolved value, or undefined when unsafe/absent
 */
const getSafeProp = (obj: unknown, prop: PropertyKey): unknown =>
  obj != null && hasOwnInPrototypeChain(obj, prop) ? (obj as Record<PropertyKey, unknown>)[prop] : undefined;

const kindOf = (cache => (thing: unknown) => {
  const str = toString.call(thing);
  return (cache as Record<string, string>)[str] || ((cache as Record<string, string>)[str] = str.slice(8, -1).toLowerCase());
})(Object.create(null) as object);

const kindOfTest = (type: string) => {
  type = type.toLowerCase();
  return (thing: unknown) => kindOf(thing) === type;
};

const typeOfTest = (type: string) => (thing: unknown) => typeof thing === type;

/**
 * Determine if a value is a non-null object
 *
 * @param {Object} val The value to test
 *
 * @returns {boolean} True if value is an Array, otherwise false
 */
const { isArray } = Array;

/**
 * Determine if a value is undefined
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if the value is undefined, otherwise false
 */
const isUndefined = typeOfTest("undefined");

/**
 * Determine if a value is a Buffer
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a Buffer, otherwise false
 */
function isBuffer(val: unknown): boolean {
  return (
    val !== null &&
    !isUndefined(val) &&
    !isUndefined((val as Record<string, unknown>).constructor) &&
    isFunction((val as { constructor: Record<string, unknown>; }).constructor["isBuffer"]) &&
    (val as { constructor: { isBuffer: (v: unknown) => boolean; }; }).constructor.isBuffer(val)
  );
}

/**
 * Determine if a value is an ArrayBuffer
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is an ArrayBuffer, otherwise false
 */
const isArrayBuffer = kindOfTest("ArrayBuffer");

/**
 * Determine if a value is a view on an ArrayBuffer
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a view on an ArrayBuffer, otherwise false
 */
function isArrayBufferView(val: unknown): boolean {
  let result;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView) {
    result = ArrayBuffer.isView(val);
  }
  else {
    result = val && (val as Record<string, unknown>).buffer && isArrayBuffer((val as Record<string, unknown>).buffer);
  }
  return !!result;
}

/**
 * Determine if a value is a String
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a String, otherwise false
 */
const isString = typeOfTest("string");

/**
 * Determine if a value is a Function
 *
 * @param {*} val The value to test
 * @returns {boolean} True if value is a Function, otherwise false
 */
const isFunction = typeOfTest("function");

/**
 * Determine if a value is a Number
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a Number, otherwise false
 */
const isNumber = typeOfTest("number");

/**
 * Determine if a value is an Object
 *
 * @param {*} thing The value to test
 *
 * @returns {boolean} True if value is an Object, otherwise false
 */
const isObject = (thing: unknown): thing is object => thing !== null && typeof thing === "object";

/**
 * Determine if a value is a Boolean
 *
 * @param {*} thing The value to test
 * @returns {boolean} True if value is a Boolean, otherwise false
 */
const isBoolean = (thing: unknown) => thing === true || thing === false;

/**
 * Determine if a value is a plain Object
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a plain Object, otherwise false
 */
const isPlainObject = (val: unknown): boolean => {
  if (!isObject(val)) {
    return false;
  }

  const prototype = getPrototypeOf(val);
  return (
    (prototype === null ||
      prototype === Object.prototype ||
      getPrototypeOf(prototype) === null) &&
    // Treat any genuine (non-Object.prototype-polluted) Symbol.toStringTag or
    // Symbol.iterator as evidence the value is a tagged/iterable type rather
    // than a plain object, while ignoring keys injected onto Object.prototype.
    !hasOwnInPrototypeChain(val, toStringTag) &&
    !hasOwnInPrototypeChain(val, iterator)
  );
};

/**
 * Determine if a value is an empty object (safely handles Buffers)
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is an empty object, otherwise false
 */
const isEmptyObject = (val: unknown): boolean => {
  // Early return for non-objects or Buffers to prevent RangeError
  if (!isObject(val) || isBuffer(val)) {
    return false;
  }

  try {
    return Object.keys(val).length === 0 && Object.getPrototypeOf(val) === Object.prototype;
  }
  catch {
    // Fallback for any other objects that might cause RangeError with Object.keys()
    return false;
  }
};

/**
 * Determine if a value is a Date
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a Date, otherwise false
 */
const isDate = kindOfTest("Date");

/**
 * Determine if a value is a File
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a File, otherwise false
 */
const isFile = kindOfTest("File");

/**
 * Determine if a value is a React Native Blob
 * React Native "blob": an object with a `uri` attribute. Optionally, it can
 * also have a `name` and `type` attribute to specify filename and content type
 *
 * @see https://github.com/facebook/react-native/blob/26684cf3adf4094eb6c405d345a75bf8c7c0bf88/Libraries/Network/FormData.js#L68-L71
 *
 * @param {*} value The value to test
 *
 * @returns {boolean} True if value is a React Native Blob, otherwise false
 */
const isReactNativeBlob = (value: unknown) => !!(value && typeof (value as Record<string, unknown>).uri !== "undefined");

/**
 * Determine if environment is React Native
 * ReactNative `FormData` has a non-standard `getParts()` method
 *
 * @param {*} formData The formData to test
 *
 * @returns {boolean} True if environment is React Native, otherwise false
 */
const isReactNative = (formData: unknown) => formData && typeof (formData as Record<string, unknown>).getParts !== "undefined";

/**
 * Determine if a value is a Blob
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a Blob, otherwise false
 */
const isBlob = kindOfTest("Blob");

/**
 * Determine if a value is a FileList
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a FileList, otherwise false
 */
const isFileList = kindOfTest("FileList");

/**
 * Determine if a value is a Stream
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a Stream, otherwise false
 */
const isStream = (val: unknown) => isObject(val) && isFunction((val as Record<string, unknown>).pipe);

/**
 * Determine if a value is a FormData
 *
 * @param {*} thing The value to test
 *
 * @returns {boolean} True if value is an FormData, otherwise false
 */
const G: Record<string, unknown> = globalThis;
const FormDataCtor = typeof G["FormData"] !== "undefined" ? G["FormData"] as new () => object : undefined;

const isFormData = (thing: unknown): boolean => {
  if (!thing) return false;
  if (FormDataCtor && thing instanceof FormDataCtor) return true;
  // Reject plain objects inheriting directly from Object.prototype so prototype-pollution gadgets can't spoof FormData.
  const proto = getPrototypeOf(thing);
  if (!proto || proto === Object.prototype) return false;
  if (!isFunction((thing as Record<string, unknown>).append)) return false;
  const kind = kindOf(thing);
  return (
    kind === "formdata" ||
    // detect form-data instance
    (kind === "object" && isFunction((thing as Record<string, unknown>).toString) && (thing as { toString: () => string; }).toString() === "[object FormData]")
  );
};

/**
 * Determine if a value is a URLSearchParams object
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a URLSearchParams object, otherwise false
 */
const isURLSearchParams = kindOfTest("URLSearchParams");

const [ isReadableStream, isRequest, isResponse, isHeaders ] = [
  "ReadableStream",
  "Request",
  "Response",
  "Headers",
].map(kindOfTest);

/**
 * Iterate over an Array or an Object invoking a function for each item.
 *
 * If `obj` is an Array callback will be called passing
 * the value, index, and complete array for each item.
 *
 * If 'obj' is an Object callback will be called passing
 * the value, key, and complete object for each property.
 *
 * @param {Object|Array<unknown>} obj The object to iterate
 * @param {Function} fn The callback to invoke for each item
 *
 * @param {Object} [options]
 * @param {Boolean} [options.allOwnKeys = false]
 * @returns {any}
 */
function forEach(obj: unknown, fn: (value: unknown, key: unknown, obj: unknown) => void, { allOwnKeys = false } = {}): void {
  // Don't bother if no value provided
  if (obj === null || typeof obj === "undefined") {
    return;
  }

  let i: number;
  let l: number;

  // Force an array if not already something iterable
  if (typeof obj !== "object") {
    /*eslint no-param-reassign:0*/
    obj = [ obj ];
  }

  if (isArray(obj)) {
    // Iterate over array values
    for (i = 0, l = obj.length; i < l; i++) {
      fn.call(null, obj[i], i, obj);
    }
  }
  else {
    // Buffer check
    if (isBuffer(obj)) {
      return;
    }

    // Iterate over object keys
    const keys = allOwnKeys ? Object.getOwnPropertyNames(obj) : Object.keys(obj as object);
    const len = keys.length;
    let key: string | undefined;

    for (i = 0; i < len; i++) {
      key = keys[i]!;
      fn.call(null, (obj as Record<string, unknown>)[key], key, obj);
    }
  }
}

/**
 * Finds a key in an object, case-insensitive, returning the actual key name.
 * Returns null if the object is a Buffer or if no match is found.
 *
 * @param {Object} obj - The object to search.
 * @param {string} key - The key to find (case-insensitive).
 * @returns {?string} The actual key name if found, otherwise null.
 */
function findKey(obj: unknown, key: string): string | null {
  if (isBuffer(obj)) {
    return null;
  }

  key = key.toLowerCase();
  const keys = Object.keys(obj as object);
  let i = keys.length;
  let _key: string | undefined;
  while (i-- > 0) {
    _key = keys[i]!;
    if (key === _key.toLowerCase()) {
      return _key;
    }
  }
  return null;
}

type GlobalWithEvents = typeof globalThis & {
  addEventListener?: (type: string, listener: (event: Record<string, unknown>) => void, capture?: boolean) => void;
  postMessage?: (message: unknown, targetOrigin: string) => void;
  setImmediate?: (cb: () => void) => void;
  process?: { nextTick?: (cb: () => void) => void; };
};
const _global = globalThis as GlobalWithEvents;

const isContextDefined = (context: unknown) => !isUndefined(context) && context !== _global;

/**
 * Accepts varargs expecting each argument to be an object, then
 * immutably merges the properties of each object and returns result.
 *
 * When multiple objects contain the same key the later object in
 * the arguments list will take precedence.
 *
 * Example:
 *
 * ```js
 * const result = merge({foo: 123}, {foo: 456});
 * console.log(result.foo); // outputs 456
 * ```
 *
 * @param {Object} obj1 Object to merge
 *
 * @returns {Object} Result of all merge properties
 */
function merge(this: unknown, ...objs: Array<unknown>): Record<string, unknown> {
  const ctx = (isContextDefined(this) && this) as { caseless?: unknown; skipUndefined?: unknown; } | false;
  const caseless = ctx && ctx.caseless;
  const skipUndefined = ctx && ctx.skipUndefined;
  const result: Record<string | symbol, unknown> = {};
  const assignValue = (val: unknown, key: unknown) => {
    const keyStr = key as string | symbol;
    // Skip dangerous property names to prevent prototype pollution
    if (keyStr === "__proto__" || keyStr === "constructor" || keyStr === "prototype") {
      return;
    }

    // findKey lowercases the key, so caseless lookup only applies to strings —
    // symbol keys are identity-matched.
    const targetKey: string | symbol = (caseless && typeof keyStr === "string" ? (findKey(result, keyStr) ?? (keyStr)) : (keyStr));
    // Read via own-prop only — a bare `result[targetKey]` walks the prototype
    // chain, so a polluted Object.prototype value could surface here and get
    // copied into the merged result.
    const existing = hasOwnProperty(result, targetKey) ? result[targetKey] : undefined;
    if (isPlainObject(existing) && isPlainObject(val)) {
      result[targetKey] = merge(existing, val);
    }
    else if (isPlainObject(val)) {
      result[targetKey] = merge({}, val);
    }
    else if (isArray(val)) {
      result[targetKey] = val.slice();
    }
    else if (!skipUndefined || !isUndefined(val)) {
      result[targetKey] = val;
    }
  };

  for (let i = 0, l = objs.length; i < l; i++) {
    const source = objs[i];
    if (!source || isBuffer(source)) {
      continue;
    }

    forEach(source, assignValue);

    if (typeof source !== "object" || isArray(source)) {
      continue;
    }

    const symbols = Object.getOwnPropertySymbols(source);
    for (let j = 0; j < symbols.length; j++) {
      const symbol = symbols[j]!;
      if (propertyIsEnumerable.call(source, symbol)) {
        assignValue((source as Record<symbol, unknown>)[symbol], symbol);
      }
    }
  }
  return result;
}

/**
 * Extends object a by mutably adding to it the properties of object b.
 *
 * @param {Object} a The object to be extended
 * @param {Object} b The object to copy properties from
 * @param {Object} thisArg The object to bind function to
 *
 * @param {Object} [options]
 * @param {Boolean} [options.allOwnKeys]
 * @returns {Object} The resulting value of object a
 */
const extend = (a: Record<string, unknown>, b: unknown, thisArg: unknown, { allOwnKeys }: { allOwnKeys?: boolean; } = {}) => {
  forEach(
    b,
    (val, key) => {
      if (thisArg && isFunction(val)) {
        Object.defineProperty(a, key as PropertyKey, Object.assign(Object.create(null) as PropertyDescriptor, {
          value: (val as (...args: Array<unknown>) => unknown).bind(thisArg),
          writable: true,
          enumerable: true,
          configurable: true,
        }));
      }
      else {
        Object.defineProperty(a, key as PropertyKey, Object.assign(Object.create(null) as PropertyDescriptor, {
          value: val,
          writable: true,
          enumerable: true,
          configurable: true,
        }));
      }
    },
    { allOwnKeys }
  );
  return a;
};

/**
 * Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
 *
 * @param {string} content with BOM
 *
 * @returns {string} content value without BOM
 */
const stripBOM = (content: string) => {
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }
  return content;
};

/**
 * Resolve object with deep prototype chain to a flat object
 * @param {Object} sourceObj source object
 * @param {Object} [destObj]
 * @param {Function|Boolean} [filter]
 * @param {Function} [propFilter]
 *
 * @returns {Object}
 */
const toFlatObject = (sourceObj: unknown, destObj?: Record<string, unknown>, filter?: ((src: object, dest: Record<string, unknown>) => boolean) | false, propFilter?: (prop: string, src: unknown, dest: Record<string, unknown>) => boolean): Record<string, unknown> => {
  let props: Array<string>;
  let i: number;
  let prop: string | undefined;
  const merged: Record<string, boolean> = {};

  const dest: Record<string, unknown> = destObj ?? {};

  if (sourceObj == null) return dest;

  let src: unknown = sourceObj;

  do {
    props = Object.getOwnPropertyNames(src);
    i = props.length;
    while (i-- > 0) {
      prop = props[i]!;
      if ((!propFilter || propFilter(prop, src, dest)) && !merged[prop]) {
        dest[prop] = (src as Record<string, unknown>)[prop];
        merged[prop] = true;
      }
    }
    src = filter !== false && getPrototypeOf(src);
  } while (src && (!filter || filter(src, dest)) && src !== Object.prototype);

  return dest;
};

const toArray = (thing?: unknown): Array<unknown> | null => {
  if (!thing) return null;
  if (isArray(thing)) return thing;
  if (!isNumber((thing as { length?: unknown; }).length)) return null;
  return Array.from(thing as ArrayLike<unknown>);
};

/**
 * Checking if the Uint8Array exists and if it does, it returns a function that checks if the
 * thing passed in is an instance of Uint8Array
 *
 * @param {TypedArray}
 *
 * @returns {Array}
 */

const isTypedArray = ((TypedArray: false | (abstract new (...args: Array<unknown>) => unknown)) =>

  (thing: unknown) => TypedArray && thing instanceof TypedArray
)(typeof Uint8Array !== "undefined" && getPrototypeOf(Uint8Array) as abstract new (...args: Array<unknown>) => unknown);

const forEachEntry = (obj: unknown, fn: (key: unknown, value: unknown) => void) => {
  for (const [ key, value ] of obj as Iterable<[unknown, unknown]>) {
    fn.call(obj, key, value);
  }
};

/**
 * It takes a regular expression and a string, and returns an array of all the matches
 *
 * @param {string} regExp - The regular expression to match against.
 * @param {string} str - The string to search.
 *
 * @returns {Array<boolean>}
 */
const matchAll = (regExp: RegExp, str: string) => {
  let matches: RegExpExecArray | null;
  const arr: Array<RegExpExecArray> = [];

  while ((matches = regExp.exec(str)) !== null) {
    arr.push(matches);
  }

  return arr;
};

/* Checking if the kindOfTest function returns true when passed an HTMLFormElement. */
const isHTMLForm = kindOfTest("HTMLFormElement");

const toCamelCase = (str: string) => str.toLowerCase().replace(/[-_\s]([a-z\d])(\w*)/g, function replacer(_m: string, p1: string, p2: string) {
  return p1.toUpperCase() + p2;
});

const { propertyIsEnumerable } = Object.prototype;

/**
 * Determine if a value is a RegExp object
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a RegExp object, otherwise false
 */
const isRegExp = kindOfTest("RegExp");

/**
 * Determine if a value is a Set
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a Set, otherwise false
 */
const isSet = kindOfTest("Set");

const reduceDescriptors = (obj: object, reducer: (descriptor: PropertyDescriptor, name: string, obj: object) => PropertyDescriptor | false | undefined) => {
  const descriptors = Object.getOwnPropertyDescriptors(obj);
  const reducedDescriptors: PropertyDescriptorMap = {};

  forEach(descriptors, (descriptor, name) => {
    let ret;
    if ((ret = reducer(descriptor as PropertyDescriptor, name as string, obj)) !== false) {
      reducedDescriptors[name as string] = ret ?? (descriptor as PropertyDescriptor);
    }
  });

  Object.defineProperties(obj, reducedDescriptors);
};

/**
 * Makes all methods read-only
 * @param {Object} obj
 */

const freezeMethods = (obj: object) => {
  // eslint-disable-next-line sonarjs/function-return-type
  reduceDescriptors(obj, (descriptor, name): PropertyDescriptor | false => {
    // skip restricted props in strict mode
    if (isFunction(obj) && [ "arguments", "caller", "callee" ].includes(name)) {
      return false;
    }

    const value = (obj as Record<string, unknown>)[name];

    if (!isFunction(value)) return false;

    descriptor.enumerable = false;

    if ("writable" in descriptor) {
      descriptor.writable = false;
      return descriptor;
    }

    if (!descriptor.set) {
      descriptor.set = () => {
        throw Error("Can not rewrite read-only method '" + name + "'");
      };
    }
    return descriptor;
  });
};

/**
 * Converts an array or a delimited string into an object set with values as keys and true as values.
 * Useful for fast membership checks.
 *
 * @param {Array|string} arrayOrString - The array or string to convert.
 * @param {string} delimiter - The delimiter to use if input is a string.
 * @returns {Object} An object with keys from the array or string, values set to true.
 */
const toObjectSet = (arrayOrString: Array<unknown> | string, delimiter: string) => {
  const obj: Record<string, boolean> = {};

  const define = (arr: Array<unknown>) => {
    arr.forEach(value => {
      obj[value as string] = true;
    });
  };

  isArray(arrayOrString) ? define(arrayOrString) : define(String(arrayOrString).split(delimiter));

  return obj;
};

const noop = () => {};

const toFiniteNumber = (value: unknown, defaultValue?: number) => {
  const num = +(value as number);
  return value != null && Number.isFinite(num) ? num : defaultValue;
};

/**
 * If the thing is a FormData object, return true, otherwise return false.
 *
 * @param {unknown} thing - The thing to check.
 *
 * @returns {boolean}
 */
function isSpecCompliantForm(thing: unknown): boolean {
  return !!(
    thing &&
    isFunction((thing as Record<string | symbol, unknown>).append) &&
    (thing as Record<string | symbol, unknown>)[toStringTag] === "FormData" &&
    (thing as Record<string | symbol, unknown>)[iterator]
  );
}

/**
 * Recursively converts an object to a JSON-compatible object, handling circular references and Buffers.
 *
 * @param {Object} obj - The object to convert.
 * @returns {Object} The JSON-compatible object.
 */
const toJSONObject = (obj: unknown): unknown => {
  const visited = new WeakSet<object>();

  const visit = (source: unknown): unknown => {
    if (isObject(source)) {
      if (visited.has(source)) {
        return;
      }

      //Buffer check
      if (isBuffer(source)) {
        return source;
      }

      if (!("toJSON" in source)) {
        // add-on descent / delete-on-ascent: preserves path semantics, so DAG nodes serialise at every occurrence (see #7230).
        visited.add(source);

        let target: unknown;
        if (isSet(source)) {
          // A Set has no enumerable own keys, so descending into it as a plain
          // object would serialise it as {} and lose every member.
          target = Array.from(source as Set<unknown>, visit).filter(
            member => !isUndefined(member)
          );
        }
        else {
          const materialized: Record<string | number, unknown> = isArray(source) ? ([] as Record<number, unknown>) : {};

          forEach(source, (value, key) => {
            const reducedValue = visit(value);
            !isUndefined(reducedValue) && (materialized[key as string] = reducedValue);
          });

          target = materialized;
        }

        visited.delete(source);

        return target;
      }
    }

    return source;
  };

  return visit(obj);
};

/**
 * Determines if a value is an async function.
 *
 * @param {*} thing - The value to test.
 * @returns {boolean} True if value is an async function, otherwise false.
 */
const isAsyncFn = kindOfTest("AsyncFunction");

/**
 * Determines if a value is thenable (has then and catch methods).
 *
 * @param {*} thing - The value to test.
 * @returns {boolean} True if value is thenable, otherwise false.
 */
const isThenable = (thing: unknown) =>
  thing &&
  (isObject(thing) || isFunction(thing)) &&
  isFunction((thing as Record<string, unknown>).then) &&
  isFunction((thing as Record<string, unknown>).catch);

// original code
// https://github.com/DigitalBrainJS/FaxiosPromise/blob/16deab13710ec09779922131f3fa5954320f83ab/lib/utils.js#L11-L34

/**
 * Provides a cross-platform setImmediate implementation.
 * Uses native setImmediate if available, otherwise falls back to postMessage or setTimeout.
 *
 * @param {boolean} setImmediateSupported - Whether setImmediate is supported.
 * @param {boolean} postMessageSupported - Whether postMessage is supported.
 * @returns {Function} A function to schedule a callback asynchronously.
 */
const _setImmediate = ((setImmediateSupported: boolean, postMessageSupported: boolean) => {
  if (setImmediateSupported) {
    return (_global["setImmediate"] as (cb: () => void) => unknown);
  }

  return postMessageSupported
    ? ((token: string, callbacks: Array<() => void>) => {
      const _addEventListener = _global.addEventListener as NonNullable<GlobalWithEvents["addEventListener"]>;
      _addEventListener(
        "message",
        (evt: Record<string, unknown>) => {
          if (evt["source"] === _global && evt["data"] === token) {
            callbacks.length && callbacks.shift()!();
          }
        },
        false
      );

      const _postMessage = _global.postMessage as NonNullable<GlobalWithEvents["postMessage"]>;

      return (cb: () => void) => {
        callbacks.push(cb);
        _postMessage(token, "*");
      };
    // eslint-disable-next-line sonarjs/pseudo-random
    })(`faxios@${Math.random()}`, [])
    : (cb: () => void) => setTimeout(cb);
})(isFunction(_global["setImmediate"]), isFunction(_global["postMessage"]));

/**
 * Schedules a microtask or asynchronous callback as soon as possible.
 * Uses queueMicrotask if available, otherwise falls back to process.nextTick or _setImmediate.
 *
 * @type {Function}
 */
 
const _process = _global["process"];
const asap =
  typeof queueMicrotask !== "undefined"
    ? queueMicrotask.bind(globalThis)
    : (_process && _process.nextTick) || _setImmediate;

// *********************

const isIterable = (thing: unknown) => thing != null && isFunction((thing as Record<symbol, unknown>)[iterator]);

/**
 * Determine if a value is iterable via an iterator that is NOT sourced solely
 * from a polluted Object.prototype. Use this instead of `isIterable` whenever
 * the iterable comes from untrusted input (e.g. user-supplied header sources),
 * so `Object.prototype[Symbol.iterator] = ...` cannot turn an ordinary object
 * into an attacker-controlled entries iterator.
 *
 * @param {*} thing The value to test
 *
 * @returns {boolean} True if value has a non-polluted iterator
 */
const isSafeIterable = (thing: unknown) =>
  thing != null && hasOwnInPrototypeChain(thing, iterator) && isIterable(thing);

export default {
  isArray,
  isArrayBuffer,
  isBuffer,
  isFormData,
  isArrayBufferView,
  isString,
  isNumber,
  isBoolean,
  isObject,
  isPlainObject,
  isEmptyObject,
  isReadableStream,
  isRequest,
  isResponse,
  isHeaders,
  isUndefined,
  isDate,
  isFile,
  isReactNativeBlob,
  isReactNative,
  isBlob,
  isRegExp,
  isSet,
  isFunction,
  isStream,
  isURLSearchParams,
  isTypedArray,
  isFileList,
  forEach,
  merge,
  extend,
  stripBOM,
  toFlatObject,
  kindOf,
  kindOfTest,
  toArray,
  forEachEntry,
  matchAll,
  isHTMLForm,
  hasOwnProperty,
  hasOwnProp: hasOwnProperty, // an alias to avoid ESLint no-prototype-builtins detection
  hasOwnInPrototypeChain,
  getSafeProp,
  reduceDescriptors,
  freezeMethods,
  toObjectSet,
  toCamelCase,
  noop,
  toFiniteNumber,
  findKey,
  global: _global,
  isContextDefined,
  isSpecCompliantForm,
  toJSONObject,
  isAsyncFn,
  isThenable,
  setImmediate: _setImmediate,
  asap,
  isIterable,
  isSafeIterable,
};
