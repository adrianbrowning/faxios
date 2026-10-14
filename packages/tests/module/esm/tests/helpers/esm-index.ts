import type {
  FaxiosError,
  FaxiosInstance,
  FaxiosProgressEvent,
  FaxiosRequestConfig,
  FaxiosResponse,
  ParamsSerializerOptions,
  RawFaxiosRequestHeaders
} from "faxios";
import faxios, {
  all,
  FaxiosHeaders,
  formToJSON,
  isFaxiosError,
  toFormData
} from "faxios";

const config: FaxiosRequestConfig = {
  url: "/user",
  method: "get",
  baseURL: "https://api.example.com/",
  allowAbsoluteUrls: false,
  transformRequest: (data: any) => "{\"foo\":\"bar\"}",
  transformResponse: [ (data: any) => ({ baz: "qux" }) ],
  headers: { "X-FOO": "bar" },
  params: { id: 12345 },
  paramsSerializer: {
    indexes: true,
    encode: (value: any) => value,
    serialize: (
      value: Record<string, any>,
      options?: ParamsSerializerOptions
    ) => String(value),
  },
  data: { foo: "bar" },
  timeout: 10000,
  withCredentials: true,
  auth: {
    username: "janedoe",
    password: "s00pers3cret",
  },
  responseType: "json",
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  onUploadProgress: (progressEvent: FaxiosProgressEvent) => {},
  onDownloadProgress: (progressEvent: FaxiosProgressEvent) => {},
  maxContentLength: -1,
  maxBodyLength: -1,
  validateStatus: (status: number) => status >= 200 && status < 300,
};

const nullValidateStatusConfig: FaxiosRequestConfig = {
  validateStatus: null,
};

const undefinedValidateStatusConfig: FaxiosRequestConfig = {
  validateStatus: undefined,
};

const handleResponse = (response: FaxiosResponse) => {
  console.log(response.data);
  console.log(response.status);
  console.log(response.statusText);
  console.log(response.headers);
  console.log(response.config);
};

const handleError = (error: FaxiosError) => {
  if (error.response) {
    console.log(error.response.data);
    console.log(error.response.status);
    console.log(error.response.headers);
  }
  else {
    console.log(error.message);
  }
};

faxios(config).then(handleResponse)
  .catch(handleError);

faxios.get("/user?id=12345").then(handleResponse)
  .catch(handleError);

faxios
  .get("/user", { params: { id: 12345 } })
  .then(handleResponse)
  .catch(handleError);

faxios.head("/user").then(handleResponse)
  .catch(handleError);

faxios.options("/user").then(handleResponse)
  .catch(handleError);

faxios.delete("/user").then(handleResponse)
  .catch(handleError);

faxios.post("/user", { foo: "bar" }).then(handleResponse)
  .catch(handleError);

faxios
  .post("/user", { foo: "bar" }, { headers: { "X-FOO": "bar" } })
  .then(handleResponse)
  .catch(handleError);

faxios.put("/user", { foo: "bar" }).then(handleResponse)
  .catch(handleError);

faxios.patch("/user", { foo: "bar" }).then(handleResponse)
  .catch(handleError);

faxios.query("/user", { foo: "bar" }).then(handleResponse)
  .catch(handleError);

// Typed methods
interface UserCreationDef {
  name: string;
}

interface User {
  id: number;
  name: string;
}

interface ResponseHeaders {
  "x-header": string;
}

// with default FaxiosResponse<T> result

const handleUserResponse = (response: FaxiosResponse<User>) => {
  console.log(response.data.id);
  console.log(response.data.name);
  console.log(response.status);
  console.log(response.statusText);
  console.log(response.headers);
  console.log(response.config);
};

faxios.get<User>("/user?id=12345").then(handleUserResponse)
  .catch(handleError);

faxios
  .get<User>("/user", { params: { id: 12345 } })
  .then(handleUserResponse)
  .catch(handleError);

faxios.head<User>("/user").then(handleUserResponse)
  .catch(handleError);

faxios.options<User>("/user").then(handleUserResponse)
  .catch(handleError);

faxios.delete<User>("/user").then(handleUserResponse)
  .catch(handleError);

faxios
  .post<User>("/user", { name: "foo", id: 1 })
  .then(handleUserResponse)
  .catch(handleError);

faxios
  .post<User>("/user", { name: "foo", id: 1 }, { headers: { "X-FOO": "bar" } })
  .then(handleUserResponse)
  .catch(handleError);

faxios
  .put<User>("/user", { name: "foo", id: 1 })
  .then(handleUserResponse)
  .catch(handleError);

faxios
  .patch<User>("/user", { name: "foo", id: 1 })
  .then(handleUserResponse)
  .catch(handleError);

// FaxiosResponse<T, D> has no axios-style third (response headers) type argument

function responseHasNoHeadersTypeArgument(): void {
  // @ts-expect-error TS2707 -- FaxiosResponse takes <T, D>; response headers are always FaxiosHeaders
  const response: FaxiosResponse<User, unknown, ResponseHeaders> | undefined = undefined;
  void response;
}

// The second type argument types the request body (D), not an axios-style resolved value

function secondTypeArgumentIsRequestData(): void {
  // @ts-expect-error TS2345 -- D is string here, so an object body is rejected
  void faxios.post<User, string>("/user", { name: "foo" });
}

// Instances

const instance1: FaxiosInstance = faxios.create();
const instance2: FaxiosInstance = instance1.create(config);

instance1(config).then(handleResponse)
  .catch(handleError);

instance1.request(config).then(handleResponse)
  .catch(handleError);

instance1.get("/user?id=12345").then(handleResponse)
  .catch(handleError);

instance1.options("/user").then(handleResponse)
  .catch(handleError);

instance1
  .get("/user", { params: { id: 12345 } })
  .then(handleResponse)
  .catch(handleError);

instance1.post("/user", { foo: "bar" }).then(handleResponse)
  .catch(handleError);

instance1
  .post("/user", { foo: "bar" }, { headers: { "X-FOO": "bar" } })
  .then(handleResponse)
  .catch(handleError);

// Defaults

faxios.defaults.headers["X-FOO"];

faxios.defaults.baseURL = "https://api.example.com/";
faxios.defaults.headers.common["Accept"] = "application/json";
faxios.defaults.headers.post["X-FOO"] = "bar";
faxios.defaults.timeout = 2500;

instance1.defaults.baseURL = "https://api.example.com/";
instance1.defaults.headers.common["Accept"] = "application/json";
instance1.defaults.headers.post["X-FOO"] = "bar";
instance1.defaults.timeout = 2500;

// faxios create defaults

faxios.create({ headers: { foo: "bar" } });
faxios.create({ headers: { common: { foo: "bar" } } });
faxios.create({
  headers: {
    "Content-Type": "application/json",
  },
  formSerializer: {
    indexes: null,
  },
  paramsSerializer: {
    indexes: null,
  },
});

// faxios.all

const promises = [ Promise.resolve(1), Promise.resolve(2) ];

const promise: Promise<Array<number>> = faxios.all(promises);

// faxios.all named export

(() => {
  const promises = [ Promise.resolve(1), Promise.resolve(2) ];

  const promise: Promise<Array<number>> = all(promises);
})();

// faxios.spread

const fn1 = (a: number, b: number, c: number) => `${a}-${b}-${c}`;
const fn2: (arr: [number, number, number]) => string = faxios.spread(fn1);

// Promises

faxios
  .get("/user")
  .then((response: FaxiosResponse) => "foo")
  .then((value: string) => {});

faxios
  .get("/user")
  .then(async (response: FaxiosResponse) => Promise.resolve("foo"))
  .then((value: string) => {});

faxios
  .get("/user")
  .then(
    (response: FaxiosResponse) => "foo",
    (error: any) => "bar"
  )
  .then((value: string) => {});

faxios
  .get("/user")
  .then(
    (response: FaxiosResponse) => "foo",
    (error: any) => 123
  )
  .then((value: number | string) => {});

faxios
  .get("/user")
  .catch((error: any) => "foo")
  .then((value: any) => {});

faxios
  .get("/user")
  .catch(async (error: any) => Promise.resolve("foo"))
  .then((value: any) => {});

// FaxiosError

faxios.get("/user").catch((error: FaxiosError) => {
  if (faxios.isFaxiosError(error)) {
    const FaxiosError: FaxiosError = error;
    console.log(FaxiosError.message);
  }

  // named export

  if (isFaxiosError(error)) {
    const FaxiosError: FaxiosError = error;
    console.log(FaxiosError.message);
  }
});

// FormData

faxios.toFormData({ x: 1 }, new FormData());

// named export
toFormData({ x: 1 }, new FormData());

// formToJSON

faxios.formToJSON(new FormData());

// named export
formToJSON(new FormData());

// AbortSignal

faxios.get("/user", { signal: new AbortController().signal });

// FaxiosHeaders methods

faxios.get("/user", {
  transformRequest: [
    (data: any, headers) => {
      headers.setContentType("text/plain");
      return "baz";
    },
    (data: any, headers) => {
      headers["foo"] = "bar";
      return "baz";
    },
  ],

  transformResponse: [
    (data: any, headers: FaxiosHeaders) => {
      headers.has("foo");
    },
  ],
});

// config headers

faxios.get("/user", {
  headers: new FaxiosHeaders({ x: 1 }),
});

faxios.get("/user", {
  headers: {
    foo: 1,
  },
});

// issue #5034

function getRequestConfig1(options: FaxiosRequestConfig): FaxiosRequestConfig {
  return {
    ...options,
    headers: {
      ...(options.headers as RawFaxiosRequestHeaders),
      Authorization: `Bearer ...`,
    },
  };
}

function getRequestConfig2(options: FaxiosRequestConfig): FaxiosRequestConfig {
  return {
    ...options,
    headers: {
      ...(options.headers as FaxiosHeaders).toJSON(),
      Authorization: `Bearer ...`,
    },
  };
}

// axios Node-adapter options faxios doesn't have

function axiosOnlyOptionsAreRejected(): void {
  // @ts-expect-error TS2769 -- no maxRate option
  void faxios.get("/user", { maxRate: 1000 });
  // @ts-expect-error TS2769 -- no maxRate option
  void faxios.get("/user", { maxRate: [ 1000, 1000 ] });
  // @ts-expect-error TS2769 -- no lookup option
  void faxios.get("/user", { lookup: (hostname: string, opt: object) => [ "127.0.0.1", 4 ] });
}

// Node progress

faxios.get("/user", {
  onUploadProgress: (e: FaxiosProgressEvent) => {
    console.log(e.loaded);
    console.log(e.total);
    console.log(e.progress);
    console.log(e.rate);
  },
});

// FaxiosHeaders

// iterator

const headers = new FaxiosHeaders({ foo: "bar" });

for (const [ header, value ] of headers) {
  console.log(header, value);
}

// index signature

(() => {
  const headers = new FaxiosHeaders({ x: 1 });

  headers.y = 2;
})();

// FaxiosHeaders as request headers

(() => {
  const headers: FaxiosHeaders = new FaxiosHeaders({ x: 1 });

  headers.y = 2;

  headers.get("x");
})();

{
  const config: FaxiosRequestConfig = {
    headers: new FaxiosHeaders({ foo: 1 }),
  };

  faxios.get("", {
    headers: {
      bar: 2,
      ...config.headers,
    },
  });
}

// FaxiosError.cause should be typed as Error to allow accessing .message
faxios.get("/user").catch((error: FaxiosError) => {
  if (error.cause) {
    // This should not produce a type error - cause is typed as Error
    const causeMessage: string | undefined = error.cause.message;
    console.log(causeMessage);
  }
});
