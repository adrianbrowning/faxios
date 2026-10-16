// Type-checked fixture (NO @ts-nocheck), compiled strictly against the packed package:
// - every type that appears in a public config or API signature is importable from the root
// - toFormData takes a FormData (or a FormData-like object) and FormSerializerOptions, and
//   returns FormData when no target is passed
// - URL request inputs compile without casts on the instance, its aliases and the Faxios class
import faxios, { CanceledError, Faxios, toFormData } from "faxios";
import type {
  AbortableSignal,
  CustomParamsSerializer,
  FaxiosBasicCredentials,
  FaxiosDefaults,
  FaxiosPluginSpec,
  FaxiosProgressEvent,
  FaxiosRequestConfig,
  FaxiosRequestTransformer,
  FaxiosResponseTransformer,
  FormDataVisitorHelpers,
  FormSerializerOptions,
  GenericAbortSignal,
  GenericFormData,
  ParamsSerializerOptions,
  SerializerVisitor,
  TransitionalOptions
} from "faxios";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

// Each exported type is the one the public config uses.
type _Progress = Expect<Equal<Parameters<NonNullable<FaxiosRequestConfig["onUploadProgress"]>>[0], FaxiosProgressEvent>>;
type _Auth = Expect<Equal<NonNullable<FaxiosRequestConfig["auth"]>, FaxiosBasicCredentials>>;
type _Transitional = Expect<Equal<NonNullable<FaxiosRequestConfig["transitional"]>, TransitionalOptions>>;

function exportedTypes(): void {
  const progress: FaxiosProgressEvent = { bytes: 1, lengthComputable: false, loaded: 1 };
  // A signal from another realm or a polyfill: only the members faxios uses.
  const signal: GenericAbortSignal = {
    aborted: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  // A polyfill whose listener methods only accept "abort" still fits.
  const polyfill: {
    aborted: boolean;
    addEventListener: (type: "abort", l: () => void) => void;
    removeEventListener: (type: "abort", l: () => void) => void;
  } = { aborted: false, addEventListener: () => undefined, removeEventListener: () => undefined };
  const polyfillSignal: GenericAbortSignal = polyfill;
  const abortable: AbortableSignal = polyfill;
  // @ts-expect-error TS2740 -- the config argument is an InternalFaxiosRequestConfig, not a bare headers bag
  void new CanceledError("x", { headers: {} });
  const visitor: SerializerVisitor | undefined = undefined;
  const helpers: FormDataVisitorHelpers | undefined = undefined;
  const toRequest: FaxiosRequestTransformer = function (data) {
    return data;
  };
  const toResponse: FaxiosResponseTransformer = function (data, _headers, status) {
    return status === 204 ? null : data;
  };
  const auth: FaxiosBasicCredentials = { username: "u", password: "p" };
  const serialize: CustomParamsSerializer = params => new URLSearchParams(params as Record<string, string>).toString();
  const paramsOptions: ParamsSerializerOptions = { dots: true, serialize };
  const formOptions: FormSerializerOptions = { dots: true, indexes: null, maxDepth: 10 };
  const transitional: TransitionalOptions = { forcedJSONParsing: true };
  const spec: FaxiosPluginSpec = { options: { retries: 0 } };
  const defaults: FaxiosDefaults = { timeout: 1, headers: faxios.defaults.headers };

  void faxios.get("/x", {
    auth,
    onUploadProgress: (event: FaxiosProgressEvent) => void event.loaded,
    paramsSerializer: paramsOptions,
    signal,
    transformRequest: [ toRequest ],
    transformResponse: toResponse,
    transitional,
  });
  void progress;
  void polyfillSignal;
  void abortable;
  void visitor;
  void helpers;
  void formOptions;
  void spec;
  void defaults;
}

function formData(): void {
  // A FormData target is typed FormData, and options are FormSerializerOptions.
  const target: FormData = toFormData({ x: 1 }, new FormData());
  const created: FormData = toFormData({ x: 1 });
  const withOptions: FormData = toFormData({ x: [ 1, 2 ] }, null, { indexes: true, maxDepth: 5 });
  // A FormData-like target keeps its own type.
  const like: GenericFormData = {
    append(name: string, value: unknown) {
      void name;
      void value;
    },
  };
  const appended: GenericFormData = toFormData({ x: 1 }, like);
  // @ts-expect-error TS2769 -- not a serializer option (toFormData is overloaded)
  toFormData({ x: 1 }, null, { nope: true });
  void target;
  void created;
  void withOptions;
  void appended;
}

async function urlInputs(): Promise<void> {
  const url = new URL("https://example.test/users");
  await faxios(url);
  await faxios(url, { method: "get" });
  await faxios({ url });
  await faxios.request({ url });
  await faxios.get(url);
  await faxios.delete(url);
  await faxios.head(url);
  await faxios.options(url);
  await faxios.post(url, { a: 1 });
  await faxios.put(url, { a: 1 });
  await faxios.patch(url, { a: 1 });
  await faxios.query(url, { a: 1 });
  await faxios.postForm(url, { a: 1 });
  await faxios.putForm(url, { a: 1 });
  await faxios.patchForm(url, { a: 1 });
  faxios.getUri({ url });
  const instance = new Faxios();
  await instance.request({ url });
  await instance.get(url);
  await instance.post(url, { a: 1 });
  instance.getUri({ url });
}

void exportedTypes;
void formData;
void urlInputs;
