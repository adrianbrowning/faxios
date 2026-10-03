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

::: warning Upload progress needs request streams
faxios reports upload progress by streaming the request body, so `onUploadProgress` only fires where the runtime's `fetch` supports streaming request bodies (`duplex: "half"`), as Node.js does. Where it doesn't, the callback is not called.
:::
