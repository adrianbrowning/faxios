declare module 'formidable' {
  import { IncomingMessage } from 'node:http';
  type Fields = Record<string, string | string[]>;
  type Files = Record<string, unknown>;
  class IncomingForm {
    parse(req: IncomingMessage, callback: (err: Error | null, fields: Fields, files: Files) => void): void;
  }
  export { IncomingForm };
  export type { Fields, Files };
}

declare module 'stream-throttle' {
  import { Transform } from 'node:stream';
  class Throttle extends Transform {
    constructor(options: { rate: number });
  }
  export { Throttle };
}
