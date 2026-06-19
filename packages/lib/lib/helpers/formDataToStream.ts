import { Readable } from "node:stream";
import util from "node:util";
import platform from "../platform/index.js";
import utils from "../utils.js";
import readBlob from "./readBlob.js";

const BOUNDARY_ALPHABET = platform.ALPHABET.ALPHA_DIGIT + "-_";

const TextEncoderCtor = (globalThis as Record<string, unknown>)["TextEncoder"] as (new () => { encode: (input?: string) => Uint8Array; }) | undefined;
const textEncoder: { encode: (input?: string) => Uint8Array; } =
  TextEncoderCtor ? new TextEncoderCtor() : new util.TextEncoder();

const CRLF = "\r\n";
const CRLF_BYTES = textEncoder.encode(CRLF);
const CRLF_BYTES_COUNT = 2;

type FormDataValue = string | { name?: string; type?: string; size: number; };

class FormDataPart {
  headers: Uint8Array;
  contentLength: number;
  size: number;
  name: string;
  value: Uint8Array | FormDataValue;

  constructor(name: string, value: FormDataValue) {
    const { escapeName } = FormDataPart;
    const isStringValue = utils.isString(value);

    let headers = `Content-Disposition: form-data; name="${escapeName(name)}"${
      !isStringValue && (value as { name?: string; }).name ? `; filename="${escapeName((value as { name: string; }).name)}"` : ""
    }${CRLF}`;

    let encodedValue: Uint8Array | FormDataValue;
    if (isStringValue) {
      encodedValue = textEncoder.encode(String(value).replace(/\r?\n|\r\n?/g, CRLF));
    }
    else {
      const safeType = String((value as { type?: string; }).type || "application/octet-stream").replace(/[\r\n]/g, "");
      headers += `Content-Type: ${safeType}${CRLF}`;
      encodedValue = value;
    }

    this.headers = textEncoder.encode(headers + CRLF);

    this.contentLength = isStringValue ? (encodedValue as Uint8Array).byteLength : (value as { size: number; }).size;

    this.size = this.headers.byteLength + this.contentLength + CRLF_BYTES_COUNT;

    this.name = name;
    this.value = encodedValue;
  }

  async *encode(): AsyncGenerator<Uint8Array> {
    yield this.headers;

    const { value } = this;

    if (utils.isTypedArray(value)) {
      yield value as Uint8Array;
    }
    else {
      yield* readBlob(value as Parameters<typeof readBlob>[0]) as AsyncIterable<Uint8Array>;
    }

    yield CRLF_BYTES;
  }

  static escapeName(name: string): string {
    const escapeMap: Record<string, string> = {
      "\r": "%0D",
      "\n": "%0A",
      "\"": "%22",
    };
    return String(name).replace(
      /[\r\n"]/g,
      (match: string) => escapeMap[match] ?? match
    );
  }
}

type ComputedHeaders = {
  "Content-Type": string;
  "Content-Length"?: number;
};

const formDataToStream = (form: unknown, headersHandler?: ((headers: ComputedHeaders) => void) | null, options?: { tag?: string; size?: number; boundary?: string; } | null): Readable => {
  const {
    tag = "form-data-boundary",
    size = 25,
    boundary = tag + "-" + platform.generateString(size, BOUNDARY_ALPHABET),
  } = options || {};

  if (!utils.isFormData(form)) {
    throw new TypeError("FormData instance required");
  }

  if (boundary.length < 1 || boundary.length > 70) {
    throw new Error("boundary must be 1-70 characters long");
  }

  const boundaryBytes = textEncoder.encode("--" + boundary + CRLF);
  const footerBytes = textEncoder.encode("--" + boundary + "--" + CRLF);
  let contentLength = footerBytes.byteLength;

  const formWithEntries = form as { entries: () => Iterable<[string, FormDataValue]>; };
  const parts = Array.from(formWithEntries.entries()).map(([ name, value ]) => {
    const part = new FormDataPart(name, value);
    contentLength += part.size;
    return part;
  });

  contentLength += boundaryBytes.byteLength * parts.length;

  contentLength = utils.toFiniteNumber(contentLength, 0) ?? 0;

  const computedHeaders: ComputedHeaders = {
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
  };

  if (Number.isFinite(contentLength)) {
    computedHeaders["Content-Length"] = contentLength;
  }

  headersHandler && headersHandler(computedHeaders);

  return Readable.from(
    (async function* () {
      for (const part of parts) {
        yield boundaryBytes;
        yield* part.encode();
      }

      yield footerBytes;
    })()
  );
};

export default formDataToStream;
