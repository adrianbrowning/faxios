// @ts-self-types="./standard-schema.d.ts"
/**
 * Vendored Standard Schema v1 types.
 * @see https://standardschema.dev
 * @see https://github.com/standard-schema/standard-schema
 */

/* eslint-disable sonarjs/no-redundant-optional */

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
  interface Props<Input = unknown, Output = Input> {
    readonly types?: Types<Input, Output>;
    readonly validate: (
      value: unknown
    ) => Promise<Result<Output>> | Result<Output>;
    readonly vendor: string;
    readonly version: 1;
  }

  interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }

  type Result<Output> = FailureResult | SuccessResult<Output>;

  interface SuccessResult<Output> {
    readonly issues?: undefined;
    readonly value: Output;
  }

  interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }

  interface Issue {
    readonly message: string;
    readonly path?:
      | ReadonlyArray<PathSegment | PropertyKey>
      | undefined;
  }

  interface PathSegment {
    readonly key: PropertyKey;
  }

  type InferInput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["input"];

  type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["output"];
}
