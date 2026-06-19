import CanceledError from "../cancel/CanceledError.js";
import AxiosError from "../core/AxiosError.js";
import AxiosHeaders from "../core/AxiosHeaders.js";
import settle from "../core/settle.js";
import transitionalDefaults from "../defaults/transitional.js";
import parseProtocol from "../helpers/parseProtocol.js";
import { progressEventReducer } from "../helpers/progressEventReducer.js";
import resolveConfig from "../helpers/resolveConfig.js";
import { toByteStringHeaderObject } from "../helpers/sanitizeHeaderValue.js";
import platform from "../platform/index.js";
import utils from "../utils.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const XHRCtor = (globalThis as Record<string, unknown>).XMLHttpRequest as (new () => any) | undefined;

const isXHRAdapterSupported = typeof (globalThis as Record<string, unknown>).XMLHttpRequest !== "undefined";

/* eslint-disable sonarjs/cognitive-complexity */
export default isXHRAdapterSupported &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function (config: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Promise(function dispatchXhrRequest(resolve: (value: any) => void, reject: (reason?: any) => void) {
      const _config = resolveConfig(config);
      let requestData = _config.data;
      const requestHeaders = AxiosHeaders.from(_config.headers).normalize(false);
      let { responseType, onUploadProgress, onDownloadProgress } = _config;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let onCanceled: ((cancel?: any) => void) | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let uploadThrottled: any, downloadThrottled: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let flushUpload: any, flushDownload: any;

      function done() {
        flushUpload && flushUpload(); // flush events
        flushDownload && flushDownload(); // flush events

        _config.cancelToken && _config.cancelToken.unsubscribe(onCanceled as (cancel: import("../types.js").Cancel) => void);

        _config.signal && _config.signal.removeEventListener && _config.signal.removeEventListener("abort", onCanceled);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let request: any = XHRCtor ? new XHRCtor() : null;

      request.open((_config.method ?? "GET").toUpperCase(), _config.url, true);

      // Set the request timeout in MS
      request.timeout = _config.timeout;

      function onloadend() {
        if (!request) {
          return;
        }
        // Prepare the response
        const responseHeaders = AxiosHeaders.from(
          "getAllResponseHeaders" in request && request.getAllResponseHeaders()
        );
        const responseData =
          !responseType || responseType === "text" || responseType === "json"
            ? request.responseText
            : request.response;
        const response = {
          data: responseData,
          status: request.status,
          statusText: request.statusText,
          headers: responseHeaders,
          config,
          request,
        };

        settle(
          function _resolve(value: unknown) {
            resolve(value);
            done();
          },
          function _reject(err: unknown) {
            reject(err);
            done();
          },
          response
        );

        // Clean up request
        request = null;
      }

      if ("onloadend" in request) {
        // Use onloadend if available
        request.onloadend = onloadend;
      }
      else {
        // Listen for ready state to emulate onloadend
        request.onreadystatechange = function handleLoad() {
          if (!request || request.readyState !== 4) {
            return;
          }

          // The request errored out and we didn't get a response, this will be
          // handled by onerror instead
          // With one exception: request that using file: protocol, most browsers
          // will return status as 0 even though it's a successful request
          if (
            request.status === 0 &&
            !(request.responseURL && request.responseURL.startsWith("file:"))
          ) {
            return;
          }
          // readystate handler is calling before onerror or ontimeout handlers,
          // so we should call onloadend on the next 'tick'
          setTimeout(onloadend);
        };
      }

      // Handle browser request cancellation (as opposed to a manual cancellation)
      request.onabort = function handleAbort() {
        if (!request) {
          return;
        }

        reject(new AxiosError("Request aborted", AxiosError.ECONNABORTED, config, request));
        done();

        // Clean up request
        request = null;
      };

      // Handle low level network errors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      request.onerror = function handleError(event: any) {
        // Browsers deliver a ProgressEvent in XHR onerror
        // (message may be empty; when present, surface it)
        // See https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/error_event
        const msg = event && event.message ? event.message : "Network Error";
        const err = new AxiosError(msg, AxiosError.ERR_NETWORK, config, request);
        // attach the underlying event for consumers who want details
        err.event = event || null;
        reject(err);
        done();
        request = null;
      };

      // Handle timeout
      request.ontimeout = function handleTimeout() {
        let timeoutErrorMessage = _config.timeout
          ? "timeout of " + _config.timeout + "ms exceeded"
          : "timeout exceeded";
        const transitional = _config.transitional || transitionalDefaults;
        if (_config.timeoutErrorMessage) {
          timeoutErrorMessage = _config.timeoutErrorMessage;
        }
        reject(
          new AxiosError(
            timeoutErrorMessage,
            transitional.clarifyTimeoutError ? AxiosError.ETIMEDOUT : AxiosError.ECONNABORTED,
            config,
            request
          )
        );
        done();

        // Clean up request
        request = null;
      };

      // Remove Content-Type if data is undefined
      requestData === undefined && (requestHeaders.setContentType as (value: unknown) => unknown)(null);

      // Add headers to the request
      if ("setRequestHeader" in request) {
        utils.forEach(toByteStringHeaderObject(requestHeaders), function setRequestHeader(val: unknown, key: unknown) {
          request.setRequestHeader(key, val);
        });
      }

      // Add withCredentials to request if needed
      if (!utils.isUndefined(_config.withCredentials)) {
        request.withCredentials = !!_config.withCredentials;
      }

      // Add responseType to request if needed
      if (responseType && responseType !== "json") {
        request.responseType = _config.responseType;
      }

      // Handle progress if needed
      if (onDownloadProgress) {
        [ downloadThrottled, flushDownload ] = progressEventReducer(onDownloadProgress, true);
        request.addEventListener("progress", downloadThrottled);
      }

      // Not all browsers support upload events
      if (onUploadProgress && request.upload) {
        [ uploadThrottled, flushUpload ] = progressEventReducer(onUploadProgress, false);

        request.upload.addEventListener("progress", uploadThrottled);

        request.upload.addEventListener("loadend", flushUpload);
      }

      if (_config.cancelToken || _config.signal) {
        // Handle cancellation

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCanceled = (cancel?: any) => {
          if (!request) {
            return;
          }
          reject(!cancel || cancel.type ? new CanceledError(null, config, request) : cancel);
          request.abort();
          done();
          request = null;
        };

        _config.cancelToken && _config.cancelToken.subscribe(onCanceled);
        if (_config.signal) {
          _config.signal.aborted
            ? onCanceled()
            : _config.signal.addEventListener && _config.signal.addEventListener("abort", onCanceled);
        }
      }

      const protocol = parseProtocol(_config.url ?? "");

      if (protocol && !platform.protocols.includes(protocol)) {
        reject(
          new AxiosError(
            "Unsupported protocol " + protocol + ":",
            AxiosError.ERR_BAD_REQUEST,
            config
          )
        );
        return;
      }

      // Send the request
      request.send(requestData || null);
    });
  };
