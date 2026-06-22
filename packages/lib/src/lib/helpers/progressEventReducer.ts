import type { AxiosProgressEvent } from "../types.js";
import utils from "../utils.js";
import speedometer from "./speedometer.js";
import throttle from "./throttle.js";

export const progressEventReducer = (listener: (data: AxiosProgressEvent) => void, isDownloadStream: boolean, freq = 3) => {
  let bytesNotified = 0;
  const _speedometer = speedometer(50, 250);

  return throttle((e: unknown) => {
    if (!e || typeof (e as Record<string, unknown>).loaded !== "number") {
      return;
    }
    const ev = e as { loaded: number; total?: number; lengthComputable?: boolean; };
    const rawLoaded = ev.loaded;
    const total = ev.lengthComputable ? ev.total : undefined;
    const loaded = total != null ? Math.min(rawLoaded, total) : rawLoaded;
    const progressBytes = Math.max(0, loaded - bytesNotified);
    const rate = _speedometer(progressBytes);

    bytesNotified = Math.max(bytesNotified, loaded);

    const data: AxiosProgressEvent = {
      loaded,
      total,
      progress: total ? loaded / total : undefined,
      bytes: progressBytes,
      rate: rate ? rate : undefined,
      estimated: rate && total ? (total - loaded) / rate : undefined,
      event: e,
      lengthComputable: total != null,
      download: isDownloadStream ? true : undefined,
      upload: isDownloadStream ? undefined : true,
    };

    listener(data);
  }, freq);
};

export const progressEventDecorator = (total: number | undefined, throttled: ReturnType<typeof throttle>): [(loaded: number) => void, () => void] => {
  const lengthComputable = total != null;

  return [
    (loaded: number) =>
      throttled[0]({
        lengthComputable,
        total,
        loaded,
      }),
    throttled[1],
  ];
};

export const asyncDecorator =
  (fn: (...args: Array<unknown>) => unknown) =>
    (...args: Array<unknown>) =>
      utils.asap(() => fn(...args));
