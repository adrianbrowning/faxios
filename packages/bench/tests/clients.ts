// The three clients' fixtures behind one shape, plus a reader that maps each client's errors onto
// one vocabulary, so every test runs unchanged against all three.
import { AxiosError, isAxiosError, isCancel as axiosIsCancel } from "axios";
import { FaxiosError, isCancel as faxiosIsCancel } from "faxios";
import { createBasic as axiosBasic } from "../fixtures/axios/basic.ts";
import { createRetrying as axiosRetrying } from "../fixtures/axios/retry.ts";
import { createValidated as axiosValidated, ValidationError as AxiosValidationError } from "../fixtures/axios/validated.ts";
import { createBasic as faxiosBasic } from "../fixtures/faxios/basic.ts";
import { createRetrying as faxiosRetrying } from "../fixtures/faxios/retry.ts";
import { createValidated as faxiosValidated } from "../fixtures/faxios/validated.ts";
import { createBasic as fetchBasic, HttpError } from "../fixtures/fetch/basic.ts";
import { createRetrying as fetchRetrying, TimeoutError } from "../fixtures/fetch/retry.ts";
import { createValidated as fetchValidated, ValidationError as FetchValidationError } from "../fixtures/fetch/validated.ts";

export type ErrorKind =
  | "canceled"
  | "network"
  | "path-schema"
  | "query-schema"
  | "response-schema"
  | "timeout"
  | `status:${number}`
  | `unknown:${string}`;

const unknownKind = (error: unknown): ErrorKind => `unknown:${String(error)}`;

function fetchKind(error: unknown): ErrorKind {
  if (error instanceof FetchValidationError) return `${error.target}-schema`;
  if (error instanceof HttpError) return `status:${error.status}`;
  if (error instanceof TimeoutError) return "timeout";
  if (error instanceof DOMException && error.name === "AbortError") return "canceled";
  if (error instanceof TypeError) return "network";
  return unknownKind(error);
}

function axiosKind(error: unknown): ErrorKind {
  if (error instanceof AxiosValidationError) return `${error.target}-schema`;
  if (axiosIsCancel(error)) return "canceled";
  if (!isAxiosError(error)) return unknownKind(error);
  if (error.response) return `status:${error.response.status}`;
  if (error.code === AxiosError.ETIMEDOUT) return "timeout";
  if (error.code === AxiosError.ERR_NETWORK) return "network";
  return unknownKind(error);
}

const FAXIOS_SCHEMA_KINDS: Record<string, ErrorKind> = {
  [FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA]: "path-schema",
  [FaxiosError.ERR_BAD_PARAMS_SCHEMA]: "query-schema",
  [FaxiosError.ERR_BAD_RESPONSE_SCHEMA]: "response-schema",
};

function faxiosKind(error: unknown): ErrorKind {
  if (faxiosIsCancel(error)) return "canceled";
  if (!(error instanceof FaxiosError)) return unknownKind(error);
  const schemaKind = FAXIOS_SCHEMA_KINDS[error.code ?? ""];
  if (schemaKind) return schemaKind;
  if (error.response) return `status:${error.response.status}`;
  if (error.code === FaxiosError.ETIMEDOUT) return "timeout";
  if (error.code === FaxiosError.ERR_NETWORK) return "network";
  return unknownKind(error);
}

export const clients = [
  { name: "fetch", createBasic: fetchBasic, createValidated: fetchValidated, createRetrying: fetchRetrying, kind: fetchKind },
  { name: "axios", createBasic: axiosBasic, createValidated: axiosValidated, createRetrying: axiosRetrying, kind: axiosKind },
  { name: "faxios", createBasic: faxiosBasic, createValidated: faxiosValidated, createRetrying: faxiosRetrying, kind: faxiosKind },
];

export type Client = (typeof clients)[number];

// Settles a promise into its value or its error kind, so a rejection is never left unhandled.
export async function outcome<T>(client: Client, promise: Promise<T>): Promise<{ kind: ErrorKind; } | { value: T; }> {
  try {
    return { value: await promise };
  }
  catch (error) {
    return { kind: client.kind(error) };
  }
}
