// @ts-nocheck
import axios = require('axios');

const config: axios.FaxiosRequestConfig = {
  url: '/user',
  method: 'get',
  allowAbsoluteUrls: false,
  baseURL: 'https://api.example.com/',
  transformRequest: (data: any) => '{"foo":"bar"}',
  transformResponse: [ (data: any) => ({ baz: 'qux' }) ],
  headers: { 'X-FOO': 'bar' },
  params: { id: 12345 },
  paramsSerializer: {
    indexes: true,
    encode: (value: any) => value,
    serialize: (value: Record<string, any>, options?: axios.ParamsSerializerOptions) =>
      String(value),
  },
  data: { foo: 'bar' },
  timeout: 10000,
  withCredentials: true,
  auth: {
    username: 'janedoe',
    password: 's00pers3cret',
  },
  responseType: 'json',
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  onUploadProgress: (progressEvent: axios.FaxiosProgressEvent) => {},
  onDownloadProgress: (progressEvent: axios.FaxiosProgressEvent) => {},
  maxContentLength: 2000,
  maxBodyLength: 2000,
  validateStatus: (status: number) => status >= 200 && status < 300,
  maxRedirects: 5,
  proxy: {
    host: '127.0.0.1',
    port: 9000,
  },
  cancelToken: new axios.CancelToken((cancel: axios.Canceler) => {}),
};

const nullValidateStatusConfig: axios.FaxiosRequestConfig = {
  validateStatus: null,
};

const undefinedValidateStatusConfig: axios.FaxiosRequestConfig = {
  validateStatus: undefined,
};

const handleResponse = (response: axios.FaxiosResponse) => {
  console.log(response.data);
  console.log(response.status);
  console.log(response.statusText);
  console.log(response.headers);
  console.log(response.config);
};

const handleError = (error: axios.FaxiosError) => {
  if (error.response) {
    console.log(error.response.data);
    console.log(error.response.status);
    console.log(error.response.headers);
  }
  else {
    console.log(error.message);
  }
};

axios(config).then(handleResponse)
  .catch(handleError);

axios.get('/user?id=12345').then(handleResponse)
  .catch(handleError);

axios
  .get('/user', { params: { id: 12345 } })
  .then(handleResponse)
  .catch(handleError);

axios.head('/user').then(handleResponse)
  .catch(handleError);

axios.options('/user').then(handleResponse)
  .catch(handleError);

axios.delete('/user').then(handleResponse)
  .catch(handleError);

axios.post('/user', { foo: 'bar' }).then(handleResponse)
  .catch(handleError);

axios
  .post('/user', { foo: 'bar' }, { headers: { 'X-FOO': 'bar' } })
  .then(handleResponse)
  .catch(handleError);

axios.put('/user', { foo: 'bar' }).then(handleResponse)
  .catch(handleError);

axios.patch('/user', { foo: 'bar' }).then(handleResponse)
  .catch(handleError);

axios.query('/user', { foo: 'bar' }).then(handleResponse)
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
  'x-header': string;
}

// with default axios.FaxiosResponse<T> result

const handleUserResponse = (response: axios.FaxiosResponse<User>) => {
  console.log(response.data.id);
  console.log(response.data.name);
  console.log(response.status);
  console.log(response.statusText);
  console.log(response.headers);
  console.log(response.config);
};

axios.get<User>('/user?id=12345').then(handleUserResponse)
  .catch(handleError);

axios
  .get<User>('/user', { params: { id: 12345 } })
  .then(handleUserResponse)
  .catch(handleError);

axios.head<User>('/user').then(handleUserResponse)
  .catch(handleError);

axios.options<User>('/user').then(handleUserResponse)
  .catch(handleError);

axios.delete<User>('/user').then(handleUserResponse)
  .catch(handleError);

axios.post<User>('/user', { name: 'foo', id: 1 }).then(handleUserResponse)
  .catch(handleError);

axios
  .post<User>('/user', { name: 'foo', id: 1 }, { headers: { 'X-FOO': 'bar' } })
  .then(handleUserResponse)
  .catch(handleError);

axios.put<User>('/user', { name: 'foo', id: 1 }).then(handleUserResponse)
  .catch(handleError);

axios.patch<User>('/user', { name: 'foo', id: 1 }).then(handleUserResponse)
  .catch(handleError);

// with custom response headers axios.FaxiosResponse<T, any, H> result

const handleUserResponseWithCustomHeaders = (
  response: axios.FaxiosResponse<User, any, ResponseHeaders>
) => {
  console.log(response.data.id);
  console.log(response.data.name);
  console.log(response.status);
  console.log(response.statusText);
  console.log(response.headers);
  console.log(response.config);
};

axios
  .get<User, axios.FaxiosResponse<User, any, ResponseHeaders>>('/user?id=12345')
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

axios
  .get<User, axios.FaxiosResponse<User, any, ResponseHeaders>>('/user', { params: { id: 12345 } })
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

axios
  .head<User, axios.FaxiosResponse<User, any, ResponseHeaders>>('/user')
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

axios
  .options<User, axios.FaxiosResponse<User, any, ResponseHeaders>>('/user')
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

axios
  .delete<User, axios.FaxiosResponse<User, any, ResponseHeaders>>('/user')
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

axios
  .post<User, axios.FaxiosResponse<User, any, ResponseHeaders>>('/user', { name: 'foo', id: 1 })
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

axios
  .post<User, axios.FaxiosResponse<User, any, ResponseHeaders>>(
    '/user',
    { name: 'foo', id: 1 },
    { headers: { 'X-FOO': 'bar' } }
  )
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

axios
  .put<User, axios.FaxiosResponse<User, any, ResponseHeaders>>('/user', { name: 'foo', id: 1 })
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

axios
  .patch<User, axios.FaxiosResponse<User, any, ResponseHeaders>>('/user', { name: 'foo', id: 1 })
  .then(handleUserResponseWithCustomHeaders)
  .catch(handleError);

// (Typed methods) with custom response type

const handleStringResponse = (response: string) => {
  console.log(response);
};

axios.get<User, string>('/user?id=12345').then(handleStringResponse)
  .catch(handleError);

axios
  .get<User, string>('/user', { params: { id: 12345 } })
  .then(handleStringResponse)
  .catch(handleError);

axios.head<User, string>('/user').then(handleStringResponse)
  .catch(handleError);

axios.options<User, string>('/user').then(handleStringResponse)
  .catch(handleError);

axios.delete<User, string>('/user').then(handleStringResponse)
  .catch(handleError);

axios
  .post<Partial<UserCreationDef>, string>('/user', { name: 'foo' })
  .then(handleStringResponse)
  .catch(handleError);

axios
  .post<Partial<UserCreationDef>, string>('/user', { name: 'foo' }, { headers: { 'X-FOO': 'bar' } })
  .then(handleStringResponse)
  .catch(handleError);

axios
  .put<Partial<UserCreationDef>, string>('/user', { name: 'foo' })
  .then(handleStringResponse)
  .catch(handleError);

axios
  .patch<Partial<UserCreationDef>, string>('/user', { name: 'foo' })
  .then(handleStringResponse)
  .catch(handleError);

axios
  .request<User, string>({
    method: 'get',
    url: '/user?id=12345',
  })
  .then(handleStringResponse)
  .catch(handleError);

// Instances

const instance1: axios.FaxiosInstance = axios.create();
const instance2: axios.FaxiosInstance = axios.create(config);

instance1(config).then(handleResponse)
  .catch(handleError);

instance1.request(config).then(handleResponse)
  .catch(handleError);

instance1.get('/user?id=12345').then(handleResponse)
  .catch(handleError);

instance1.options('/user').then(handleResponse)
  .catch(handleError);

instance1
  .get('/user', { params: { id: 12345 } })
  .then(handleResponse)
  .catch(handleError);

instance1.post('/user', { foo: 'bar' }).then(handleResponse)
  .catch(handleError);

instance1
  .post('/user', { foo: 'bar' }, { headers: { 'X-FOO': 'bar' } })
  .then(handleResponse)
  .catch(handleError);

// Defaults

axios.defaults.headers['X-FOO'];

axios.defaults.baseURL = 'https://api.example.com/';
axios.defaults.headers.common['Accept'] = 'application/json';
axios.defaults.headers.post['X-FOO'] = 'bar';
axios.defaults.timeout = 2500;

instance1.defaults.baseURL = 'https://api.example.com/';
instance1.defaults.headers.common['Accept'] = 'application/json';
instance1.defaults.headers.post['X-FOO'] = 'bar';
instance1.defaults.timeout = 2500;

// axios create defaults

axios.create({ headers: { foo: 'bar' } });
axios.create({ headers: { common: { foo: 'bar' } } });
axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
  formSerializer: {
    indexes: null,
  },
  paramsSerializer: {
    indexes: null,
  },
});

// Interceptors

const requestInterceptorId: number = axios.interceptors.request.use(
  (config: axios.InternalFaxiosRequestConfig) => config,
  async (error: any) => Promise.reject(error)
);

axios.interceptors.request.eject(requestInterceptorId);

axios.interceptors.request.use(
  async (config: axios.InternalFaxiosRequestConfig) => Promise.resolve(config),
  async (error: any) => Promise.reject(error)
);

axios.interceptors.request.use((config: axios.InternalFaxiosRequestConfig) => config);
axios.interceptors.request.use(async (config: axios.InternalFaxiosRequestConfig) =>
  Promise.resolve(config)
);

const responseInterceptorId: number = axios.interceptors.response.use(
  (response: axios.FaxiosResponse) => response,
  async (error: any) => Promise.reject(error)
);

axios.interceptors.response.eject(responseInterceptorId);

axios.interceptors.response.use(
  async (response: axios.FaxiosResponse) => Promise.resolve(response),
  async (error: any) => Promise.reject(error)
);

axios.interceptors.request.use(req => {
  // https://github.com/axios/axios/issues/5415
  req.headers.set('foo', 'bar');
  req.headers['Content-Type'] = 123;
  return req;
});

const voidRequestInterceptorId = axios.interceptors.request.use(
  // @ts-expect-error -- Must return an axios.FaxiosRequestConfig (or throw)
  _response => {},
  async (error: any) => Promise.reject(error)
);
const voidResponseInterceptorId = axios.interceptors.response.use(
  // @ts-expect-error -- Must return an axios.FaxiosResponse (or throw)
  _response => {},
  async (error: any) => Promise.reject(error)
);
axios.interceptors.request.eject(voidRequestInterceptorId);
axios.interceptors.response.eject(voidResponseInterceptorId);

axios.interceptors.response.use((response: axios.FaxiosResponse) => response);
axios.interceptors.response.use(async (response: axios.FaxiosResponse) => Promise.resolve(response));

axios.interceptors.request.clear();
axios.interceptors.response.clear();

// Adapters

const adapter: axios.FaxiosAdapter = async (config: axios.InternalFaxiosRequestConfig) => {
  const response: axios.FaxiosResponse = {
    data: { foo: 'bar' },
    status: 200,
    statusText: 'OK',
    headers: { 'X-FOO': 'bar' },
    config,
  };
  return Promise.resolve(response);
};

axios.defaults.adapter = adapter;

// axios.all

const promises = [ Promise.resolve(1), Promise.resolve(2) ];

const promise: Promise<Array<number>> = axios.all(promises);

// axios.spread

const fn1 = (a: number, b: number, c: number) => `${a}-${b}-${c}`;
const fn2: (arr: Array<number>) => string = axios.spread(fn1);

// Promises

axios
  .get('/user')
  .then((response: axios.FaxiosResponse) => 'foo')
  .then((value: string) => {});

axios
  .get('/user')
  .then(async (response: axios.FaxiosResponse) => Promise.resolve('foo'))
  .then((value: string) => {});

axios
  .get('/user')
  .then(
    (response: axios.FaxiosResponse) => 'foo',
    (error: any) => 'bar'
  )
  .then((value: string) => {});

axios
  .get('/user')
  .then(
    (response: axios.FaxiosResponse) => 'foo',
    (error: any) => 123
  )
  .then((value: string | number) => {});

axios
  .get('/user')
  .catch((error: any) => 'foo')
  .then(value => {});

axios
  .get('/user')
  .catch(async (error: any) => Promise.resolve('foo'))
  .then(value => {});

// axios.Cancellation

const source: axios.CancelTokenSource = axios.CancelToken.source();

axios
  .get('/user', {
    cancelToken: source.token,
  })
  .catch((thrown: axios.FaxiosError | axios.Cancel) => {
    if (axios.isCancel(thrown)) {
      const cancel: axios.Cancel = thrown;
      console.log(cancel.message);
    }
  });

source.cancel('Operation has been axios.Canceled.');

// axios.FaxiosError

axios.get('/user').catch(error => {
  if (axios.isFaxiosError(error)) {
    const axiosError: axios.FaxiosError = error;
    console.log(axiosError.message);
  }
});

// FormData

axios.toFormData({ x: 1 }, new FormData());

// AbortSignal

axios.get('/user', { signal: new AbortController().signal });

// FaxiosHeaders methods

axios.get('/user', {
  transformRequest: (data, headers) => {
    headers.setContentType('text/plain');
    headers['Foo'] = 'bar';
  },

  transformResponse: (data, headers) => {
    headers.has('foo');
  },
});

// Max Rate

axios.get('/user', {
  maxRate: 1000,
});

axios.get('/user', {
  maxRate: [ 1000, 1000 ],
});

// Node progress

axios.get('/user', {
  onUploadProgress: (e: axios.FaxiosProgressEvent) => {
    console.log(e.loaded);
    console.log(e.total);
    console.log(e.progress);
    console.log(e.rate);
  },
});

// FaxiosHeaders

// iterator

const headers = new axios.FaxiosHeaders({ foo: 'bar' });

for (const [ header, value ] of headers) {
  console.log(header, value);
}

// index signature

(() => {
  const headers = new axios.FaxiosHeaders({ x: 1 });

  headers.y = 2;
})();

// FaxiosRequestHeaders

(() => {
  const headers: axios.FaxiosRequestHeaders = new axios.FaxiosHeaders({ x: 1 });

  headers.y = 2;

  headers.get('x');
})();

// FaxiosHeaders instance assignment

{
  const requestInterceptorId: number = axios.interceptors.request.use(
    async config => {
      config.headers.Accept = 'foo';
      config.headers.setAccept('foo');
      config.headers = new axios.FaxiosHeaders({ x: 1 });
      config.headers.foo = '1';
      config.headers.set('bar', '2');
      config.headers.set({ myHeader: 'myValue' });
      config.headers = new axios.FaxiosHeaders({ myHeader: 'myValue' });
      config.headers = { ...config.headers } as axios.FaxiosRequestHeaders;
      return config;
    },
    async (error: any) => Promise.reject(error)
  );
}

{
  const config: axios.FaxiosRequestConfig = { headers: new axios.FaxiosHeaders({ foo: 1 }) };

  axios.get('', {
    headers: {
      bar: 2,
      ...config.headers,
    },
  });
}
