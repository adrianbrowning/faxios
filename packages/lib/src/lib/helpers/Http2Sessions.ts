"use strict";

// Node-only: relies on the built-in `http2` module. Browser/react-native
// builds replace `lib/adapters/http.js` (the sole importer) with `lib/helpers/null.js`
// via the `browser` package.json field, so this module is never reached in
// those environments. Do not import it from any browser-reachable code path.

import http2 from "node:http2";
import util from "node:util";

type SessionOptions = Record<string, unknown> & { sessionTimeout?: number | null; };
type SessionEntry = [http2.ClientHttp2Session, SessionOptions];

class Http2Sessions {
  sessions: Record<string, Array<SessionEntry>>;

  constructor() {
    this.sessions = Object.create(null) as Record<string, Array<SessionEntry>>;
  }

  getSession(authority: string, options: SessionOptions = {}): http2.ClientHttp2Session {
    options = Object.assign(
      {
        sessionTimeout: 1000,
      },
      options
    );

    let authoritySessions: Array<SessionEntry> | undefined = this.sessions[authority];

    if (authoritySessions) {
      const len = authoritySessions.length;

      for (let i = 0; i < len; i++) {
        const [ sessionHandle, sessionOptions ] = authoritySessions[i]!;
        if (
          !sessionHandle.destroyed &&
          !sessionHandle.closed &&
          util.isDeepStrictEqual(sessionOptions, options)
        ) {
          return sessionHandle;
        }
      }
    }

    const session = http2.connect(authority, options as unknown as http2.SecureClientSessionOptions);

    let removed: boolean | undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const removeSession = () => {
      if (removed) {
        return;
      }

      removed = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      const entries = authoritySessions;
      if (!entries) return;
      let len = entries.length;
      let i = len;

      while (i--) {
        if (entries[i]![0] === session) {
          if (len === 1) {
            delete this.sessions[authority];
          }
          else {
            entries.splice(i, 1);
          }
          if (!session.closed) {
            session.close();
          }
          return;
        }
      }
    };

    const originalRequestFn = session.request.bind(session);

    const { sessionTimeout } = options;

    if (sessionTimeout != null) {
      let streamsCount = 0;

      (session as unknown as { request: (...args: Parameters<http2.ClientHttp2Session["request"]>) => http2.ClientHttp2Stream; }).request = function (...args: Parameters<http2.ClientHttp2Session["request"]>) {
        const stream = originalRequestFn(...args);

        streamsCount++;

        if (timer) {
          clearTimeout(timer);
          timer = null;
        }

        stream.once("close", () => {
          if (!--streamsCount) {
            timer = setTimeout(() => {
              timer = null;
              removeSession();
            }, sessionTimeout);
          }
        });

        return stream;
      };
    }

    session.once("close", removeSession);

    const entry: SessionEntry = [ session, options ];

    if (authoritySessions) {
      authoritySessions.push(entry);
    }
    else {
      authoritySessions = [ entry ];
      this.sessions[authority] = authoritySessions;
    }

    return session;
  }
}

export default Http2Sessions;
