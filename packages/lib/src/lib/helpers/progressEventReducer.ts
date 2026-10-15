import type { FaxiosProgressEvent } from "../types.js";
import { isThenable } from "../utils.js";
import speedometer from "./speedometer.js";
import throttle from "./throttle.js";

/**
 * Builds the progress callback for one direction of a request. `report(loaded)` takes the bytes
 * transferred so far; `flush()` delivers a throttled final count. The listener is caller code: it
 * runs on a queued microtask, and any error it throws (or a promise it rejects) is ignored so it
 * can't become an uncaught exception or change how the request settles.
 */
export const progressReporter = (
  listener: (data: FaxiosProgressEvent) => unknown,
  total: number | undefined,
  isDownload: boolean,
  freq = 3
): [report: (loaded: number) => void, flush: () => void] => {
  let bytesNotified = 0;
  const _speedometer = speedometer(50, 250);

  const notify = (data: FaxiosProgressEvent): void => queueMicrotask(() => {
    try {
      const result = listener(data);
      if (isThenable(result)) {
        result.then(undefined, () => {});
      }
    }
    catch {
      // Ignored by design: see the onUploadProgress/onDownloadProgress docs.
    }
  });

  const [ throttled, flush ] = throttle((rawLoaded: unknown) => {
    const count = Number(rawLoaded);
    const loaded = total != null ? Math.min(count, total) : count;
    const progressBytes = Math.max(0, loaded - bytesNotified);
    const rate = _speedometer(progressBytes);

    bytesNotified = Math.max(bytesNotified, loaded);

    notify({
      loaded,
      total,
      progress: total ? loaded / total : undefined,
      bytes: progressBytes,
      rate: rate ? rate : undefined,
      estimated: rate && total ? (total - loaded) / rate : undefined,
      lengthComputable: total != null,
      download: isDownload ? true : undefined,
      upload: isDownload ? undefined : true,
    });
  }, freq);

  return [ (loaded: number) => throttled(loaded), flush ];
};
