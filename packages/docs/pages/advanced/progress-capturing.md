# Progress capturing

faxios can capture download progress in all supported runtimes. The frequency of progress events is limited to 3 times per second to avoid overwhelming consumers. An example of capturing download progress is shown below:

```js
import faxios from "@gcmdev/faxios";

const url = '/downloads/report.pdf';

await faxios.get(url, {
  onDownloadProgress: function (progressEvent) {
    /*{
      loaded: number;
      total?: number;
      progress?: number; // in range [0..1]
      bytes: number; // how many bytes have been transferred since the last trigger (delta)
      estimated?: number; // estimated time in seconds
      rate?: number; // download speed in bytes
      lengthComputable: boolean; // whether total is known
      download: true; // download sign
    }*/
  },
});
```

For a compressed response (any `Content-Encoding` other than `identity`), `Content-Length` is the compressed size while `loaded` counts decoded bytes. faxios reports `total: undefined`, `progress: undefined` and `lengthComputable: false` for these responses.

If a progress callback throws, or returns a promise that rejects, faxios catches and ignores the error. The request carries on and settles as if the callback had returned normally.

::: warning Upload progress is not reported in browsers
`onUploadProgress` is called only where faxios can stream the request body, which today is Node.js. In browsers and web workers faxios never streams the body for progress, so the callback is not called. See [Fetch adapter](/pages/advanced/fetch-adapter) for details and [#209](https://github.com/adrianbrowning/faxios/issues/209) for upload progress in browsers.
:::
