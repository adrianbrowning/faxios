// @ts-nocheck
import type {
  FaxiosRequestConfig,
  FaxiosRequestHeaders,
  FaxiosResponseHeaders,
  RawFaxiosRequestHeaders,
  FaxiosResponse,
  FaxiosError,
  FaxiosInstance,
  FaxiosProgressEvent,
  ParamsSerializerOptions,
  AddressFamily
} from "faxios";
import faxios, {
  FaxiosHeaders,
  toFormData,
  formToJSON,
  all,
  isFaxiosError
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
  maxContentLength: 2000,
  maxBodyLength: 2000,
  validateStatus: (status: number) => status >= 200 && status < 300,
  maxRedirects: 5,
  proxy: {
    host: "127.0.0.1",
    port: 9000,
  },
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

// with custom response headers FaxiosResponse<T, any, H> result

const handleUserResponseWithCustomHeaders = (
  response: FaxiosResponse<User, any, ResponseHeaders>
) => {
  console.log(response.data.id);
  console.log(response.data.name);
  console.log(response.status);
  console.log(response.statusText);
  console.log(response.headers);
  console.log(response.config);
};

faxios
  .get<User, FaxiosResponse<User, any, ResponseHeaders>>("/user?id=12345")
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

faxios
  .get<User, FaxiosResponse<User, any, ResponseHeaders>>("/user", {
    params: { id: 12345 },
  })
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

faxios
  .head<User, FaxiosResponse<User, any, ResponseHeaders>>("/user")
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

faxios
  .options<User, FaxiosResponse<User, any, ResponseHeaders>>("/user")
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

faxios
  .delete<User, FaxiosResponse<User, any, ResponseHeaders>>("/user")
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

faxios
  .post<
  User,
  FaxiosResponse<User, any, ResponseHeaders>
>("/user", { name: "foo", id: 1 })
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

faxios
  .post<User, FaxiosResponse<User, any, ResponseHeaders>>(
    "/user",
    { name: "foo", id: 1 },
    { headers: { "X-FOO": "bar" } }
  )
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

faxios
  .put<
  User,
  FaxiosResponse<User, any, ResponseHeaders>
>("/user", { name: "foo", id: 1 })
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

faxios
  .patch<
  User,
  FaxiosResponse<User, any, ResponseHeaders>
>("/user", { name: "foo", id: 1 })
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

// (Typed methods) with custom response type

const handleStringResponse = (response: string) => {
  console.log(response);
};

faxios
  .get<User, string>("/user?id=12345")
  .then(handleStringResponse)
  .catch(handleError);

faxios
  .get<User, string>("/user", { params: { id: 12345 } })
  .then(handleStringResponse)
  .catch(handleError);

faxios
  .head<User, string>("/user")
  .then(handleStringResponse)
  .catch(handleError);

faxios
  .options<User, string>("/user")
  .then(handleStringResponse)
  .catch(handleError);

faxios
  .delete<User, string>("/user")
  .then(handleStringResponse)
  .catch(handleError);

faxios
  .post<Partial<UserCreationDef>, string>("/user", { name: "foo" })
  .then(handleStringResponse)
  .catch(handleError);

faxios
  .post<Partial<UserCreationDef>, string>(
    "/user",
    { name: "foo" },
    { headers: { "X-FOO": "bar" } }
  )
  .then(handleStringResponse)
  .catch(handleError);

faxios
  .put<Partial<UserCreationDef>, string>("/user", { name: "foo" })
  .then(handleStringResponse)
  .catch(handleError);

faxios
  .patch<Partial<UserCreationDef>, string>("/user", { name: "foo" })
  .then(handleStringResponse)
  .catch(handleError);

faxios
  .request<User, string>({
    method: "get",
    url: "/user?id=12345",
  })
  .then(handleStringResponse)
  .catch(handleError);

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

// Interceptors

const requestInterceptorId: number = faxios.interceptors.request.use(
  async config => {
    await faxios.get("/foo", {
      headers: config.headers,
    });
    return config;
  },
  async (error: any) => Promise.reject(error),
  { synchronous: false }
);

faxios.interceptors.request.eject(requestInterceptorId);

faxios.interceptors.request.use(
  async config => Promise.resolve(config),
  async (error: any) => Promise.reject(error)
);

faxios.interceptors.request.use(config => config);
faxios.interceptors.request.use(async config => Promise.resolve(config));

const responseInterceptorId: number = faxios.interceptors.response.use(
  (response: FaxiosResponse) => response,
  async (error: any) => Promise.reject(error)
);

faxios.interceptors.response.eject(responseInterceptorId);

faxios.interceptors.response.use(
  async (response: FaxiosResponse) => Promise.resolve(response),
  async (error: any) => Promise.reject(error)
);

faxios.interceptors.request.use(req => {
  // https://github.com/faxios/faxios/issues/5415
  req.headers.set("foo", "bar");
  req.headers["Content-Type"] = 123;
  return req;
});

const voidRequestInterceptorId = faxios.interceptors.request.use(
  // @ts-expect-error -- Must return an FaxiosRequestConfig (or throw)
  _response => {},
  async (error: any) => Promise.reject(error)
);
const voidResponseInterceptorId = faxios.interceptors.response.use(
  // @ts-expect-error -- Must return an FaxiosResponse (or throw)
  _response => {},
  async (error: any) => Promise.reject(error)
);
faxios.interceptors.request.eject(voidRequestInterceptorId);
faxios.interceptors.response.eject(voidResponseInterceptorId);

faxios.interceptors.response.use((response: FaxiosResponse) => response);
faxios.interceptors.response.use(async (response: FaxiosResponse) =>
  Promise.resolve(response)
);

faxios.interceptors.request.clear();
faxios.interceptors.response.clear();

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
const fn2: (arr: Array<number>) => string = faxios.spread(fn1);

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
  .then((value: string | number) => {});

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

faxios.toFormData(new FormData());

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
    (data: any, headers: FaxiosResponseHeaders) => {
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

// Max Rate

faxios.get("/user", {
  maxRate: 1000,
});

faxios.get("/user", {
  maxRate: [ 1000, 1000 ],
});

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

// FaxiosRequestHeaders

(() => {
  const headers: FaxiosRequestHeaders = new FaxiosHeaders({ x: 1 });

  headers.y = 2;

  headers.get("x");
})();

// FaxiosHeaders instance assignment

{
  const requestInterceptorId: number = faxios.interceptors.request.use(
    async config => {
      config.headers.Accept = "foo";
      config.headers.setAccept("foo");
      config.headers = new FaxiosHeaders({ x: 1 });
      config.headers.foo = "1";
      config.headers.set("bar", "2");
      config.headers.set({ myHeader: "myValue" });
      config.headers = new FaxiosHeaders({ myHeader: "myValue" });
      config.headers = { ...config.headers };
      return config;
    },
    async (error: any) => Promise.reject(error)
  );
}

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

// lookup
faxios.get("/user", {
  lookup: (
    hostname: string,
    opt: object,
    cb: (err: Error | null, address: string, family: AddressFamily) => void
  ) => {
    cb(null, "127.0.0.1", 4);
  },
});

// lookup async
faxios.get("/user", {
  lookup: (hostname: string, opt: object) => [ "127.0.0.1", 4 ],
});

// FaxiosError.cause should be typed as Error to allow accessing .message
faxios.get("/user").catch((error: FaxiosError) => {
  if (error.cause) {
    // This should not produce a type error - cause is typed as Error
    const causeMessage: string | undefined = error.cause.message;
    console.log(causeMessage);
  }
});
