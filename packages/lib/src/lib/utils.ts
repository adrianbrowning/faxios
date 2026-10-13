"use strict";

// utils is a library of generic helper functions non-specific to faxios

const { toString } = Object.prototype;
const { getPrototypeOf } = Object;
const { iterator, toStringTag } = Symbol;

export const hasOwnProp = (obj: unknown, prop: PropertyKey) => Object.hasOwn(obj as object, prop);

/**
 * The one dangerous-key check: `__proto__`, `constructor` and `prototype` are skipped wherever
 * config, route or form data keys are materialized into objects, to block prototype-pollution writes.
 */
export const isDangerousKey = (key: PropertyKey): boolean =>
  key === "__proto__" || key === "constructor" || key === "prototype";

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
export const hasOwnInPrototypeChain = (thing: unknown, prop: PropertyKey): boolean => {
  let obj: null | object = thing != null && typeof thing === "object" ? thing : null;
  if (obj === null) return false;
  const seen: Array<object> = [];

  while (obj != null && obj !== Object.prototype) {
    if (seen.indexOf(obj) !== -1) {
      return false;
    }
    seen.push(obj);

    if (hasOwnProp(obj, prop)) {
      return true;
    }
    obj = getPrototypeOf(obj) as null | object;
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
export const getSafeProp = (obj: unknown, prop: PropertyKey): unknown =>
  obj != null && hasOwnInPrototypeChain(obj, prop) ? (obj as Record<PropertyKey, unknown>)[prop] : undefined;

export const kindOf = (cache => (thing: unknown) => {
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
export const { isArray } = Array;

/**
 * Determine if a value is undefined
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if the value is undefined, otherwise false
 */
export const isUndefined = typeOfTest("undefined");

/**
 * Determine if a value is a Buffer
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a Buffer, otherwise false
 */
export function isBuffer(val: unknown): boolean {
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
export const isArrayBuffer = kindOfTest("ArrayBuffer");

/**
 * Determine if a value is a view on an ArrayBuffer
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a view on an ArrayBuffer, otherwise false
 */
export function isArrayBufferView(val: unknown): boolean {
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
export const isString = typeOfTest("string");

/**
 * Determine if a value is a Function
 *
 * @param {*} val The value to test
 * @returns {boolean} True if value is a Function, otherwise false
 */
export const isFunction = typeOfTest("function");

/**
 * Determine if a value is a Number
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a Number, otherwise false
 */
export const isNumber = typeOfTest("number");

/**
 * Determine if a value is an Object
 *
 * @param {*} thing The value to test
 *
 * @returns {boolean} True if value is an Object, otherwise false
 */
export const isObject = (thing: unknown): thing is object => thing !== null && typeof thing === "object";

/**
 * Determine if a value is a Boolean
 *
 * @param {*} thing The value to test
 * @returns {boolean} True if value is a Boolean, otherwise false
 */
export const isBoolean = (thing: unknown) => thing === true || thing === false;

/**
 * Determine if a value is a plain Object
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a plain Object, otherwise false
 */
export const isPlainObject = (val: unknown): boolean => {
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
 * Determine if a value is a Date
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a Date, otherwise false
 */
export const isDate = kindOfTest("Date");

/**
 * Determine if a value is a File
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a File, otherwise false
 */
export const isFile = kindOfTest("File");

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
export const isReactNativeBlob = (value: unknown) => !!(value && typeof (value as Record<string, unknown>).uri !== "undefined");

/**
 * Determine if environment is React Native
 * ReactNative `FormData` has a non-standard `getParts()` method
 *
 * @param {*} formData The formData to test
 *
 * @returns {boolean} True if environment is React Native, otherwise false
 */
export const isReactNative = (formData: unknown) => formData && typeof (formData as Record<string, unknown>).getParts !== "undefined";

/**
 * Determine if a value is a Blob
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a Blob, otherwise false
 */
export const isBlob = kindOfTest("Blob");

/**
 * Determine if a value is a FileList
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a FileList, otherwise false
 */
export const isFileList = kindOfTest("FileList");

/**
 * Determine if a value is a Stream
 *
 * @param {*} val The value to test
 *
 * @returns {boolean} True if value is a Stream, otherwise false
 */
export const isStream = (val: unknown) => isObject(val) && isFunction((val as Record<string, unknown>).pipe);

/**
 * Determine if a value is a FormData
 *
 * @param {*} thing The value to test
 *
 * @returns {boolean} True if value is an FormData, otherwise false
 */
const G: Record<string, unknown> = globalThis;
const FormDataCtor = typeof G["FormData"] !== "undefined" ? G["FormData"] as new () => object : undefined;

export const isFormData = (thing: unknown): boolean => {
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
export const isURLSearchParams = kindOfTest("URLSearchParams");

export const isReadableStream = kindOfTest("ReadableStream");

export const isRequest = kindOfTest("Request");

export const isResponse = kindOfTest("Response");

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
export function forEach(obj: unknown, fn: (value: unknown, key: unknown, obj: unknown) => void, { allOwnKeys = false } = {}): void {
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
export function findKey(obj: unknown, key: string): null | string {
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

const isContextDefined = (context: unknown) => !isUndefined(context) && context !== globalThis;

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
export function merge(this: unknown, ...objs: Array<unknown>): Record<string, unknown> {
  const ctx = (isContextDefined(this) && this) as false | { caseless?: unknown; skipUndefined?: unknown; };
  const caseless = ctx && ctx.caseless;
  const skipUndefined = ctx && ctx.skipUndefined;
  const result: Record<string | symbol, unknown> = {};
  // Caseless mode: lowercased key -> the key already written to `result`. Only assignValue
  // writes to `result`, so this index is complete.
  const caselessKeys = new Map<string, string>();
  const assignValue = (val: unknown, key: unknown) => {
    const keyStr = key as string | symbol;
    // Skip dangerous property names to prevent prototype pollution
    if (isDangerousKey(keyStr)) {
      return;
    }

    // Caseless lookup only applies to strings — symbol keys are identity-matched.
    const lowerKey = caseless && typeof keyStr === "string" ? keyStr.toLowerCase() : undefined;
    const targetKey: string | symbol = (lowerKey === undefined ? keyStr : (caselessKeys.get(lowerKey) ?? keyStr));
    // Read via own-prop only — a bare `result[targetKey]` walks the prototype
    // chain, so a polluted Object.prototype value could surface here and get
    // copied into the merged result.
    const existing = hasOwnProp(result, targetKey) ? result[targetKey] : undefined;
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
    if (lowerKey !== undefined && hasOwnProp(result, targetKey)) {
      caselessKeys.set(lowerKey, targetKey as string);
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
export const extend = (a: Record<string, unknown>, b: unknown, thisArg: unknown, { allOwnKeys }: { allOwnKeys?: boolean; } = {}) => {
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
 * Resolve object with deep prototype chain to a flat object
 * @param {Object} sourceObj source object
 * @param {Object} [destObj]
 * @param {Function|Boolean} [filter]
 * @param {Function} [propFilter]
 *
 * @returns {Object}
 */
export const toFlatObject = (sourceObj: unknown, destObj?: Record<string, unknown>, filter?: ((src: object, dest: Record<string, unknown>) => boolean) | false, propFilter?: (prop: string, src: unknown, dest: Record<string, unknown>) => boolean): Record<string, unknown> => {
  let props: Array<string>;
  let i: number;
  let prop: string | undefined;
  // Null prototype: a polluted Object.prototype[prop] must not mark an own prop as already copied.
  const merged: Record<string, boolean> = Object.create(null);

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

export const toArray = (thing?: unknown): Array<unknown> | null => {
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

export const isTypedArray = ((TypedArray: (abstract new (...args: Array<unknown>) => unknown) | false) =>

  (thing: unknown) => TypedArray && thing instanceof TypedArray
)(typeof Uint8Array !== "undefined" && getPrototypeOf(Uint8Array) as abstract new (...args: Array<unknown>) => unknown);

export const forEachEntry = (obj: unknown, fn: (key: unknown, value: unknown) => void) => {
  for (const [ key, value ] of obj as Iterable<[unknown, unknown]>) {
    fn.call(obj, key, value);
  }
};

/* Checking if the kindOfTest function returns true when passed an HTMLFormElement. */
export const isHTMLForm = kindOfTest("HTMLFormElement");

export const toCamelCase = (str: string) => str.toLowerCase().replace(/[-_\s]([a-z\d])(\w*)/g, function replacer(_m: string, p1: string, p2: string) {
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
export const isRegExp = kindOfTest("RegExp");

export const reduceDescriptors = (obj: object, reducer: (descriptor: PropertyDescriptor, name: string, obj: object) => false | PropertyDescriptor | undefined) => {
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

export const freezeMethods = (obj: object) => {
  // eslint-disable-next-line sonarjs/function-return-type
  reduceDescriptors(obj, (descriptor, name): false | PropertyDescriptor => {
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
export const toObjectSet = (arrayOrString: Array<unknown> | string, delimiter: string) => {
  const obj: Record<string, boolean> = {};

  const define = (arr: Array<unknown>) => {
    arr.forEach(value => {
      obj[value as string] = true;
    });
  };

  isArray(arrayOrString) ? define(arrayOrString) : define(String(arrayOrString).split(delimiter));

  return obj;
};

export const toFiniteNumber = (value: unknown, defaultValue?: number) => {
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
export function isSpecCompliantForm(thing: unknown): boolean {
  return !!(
    thing &&
    isFunction((thing as Record<string | symbol, unknown>).append) &&
    (thing as Record<string | symbol, unknown>)[toStringTag] === "FormData" &&
    (thing as Record<string | symbol, unknown>)[iterator]
  );
}

/**
 * Determines if a value is thenable (has then and catch methods).
 *
 * @param {*} thing - The value to test.
 * @returns {boolean} True if value is thenable, otherwise false.
 */
export const isThenable = (thing: unknown) =>
  thing &&
  (isObject(thing) || isFunction(thing)) &&
  isFunction((thing as Record<string, unknown>).then) &&
  isFunction((thing as Record<string, unknown>).catch);

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
export const isSafeIterable = (thing: unknown) =>
  thing != null && hasOwnInPrototypeChain(thing, iterator) && isIterable(thing);
