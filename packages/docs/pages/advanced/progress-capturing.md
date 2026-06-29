# Progress capturing

faxios can capture download progress in all supported runtimes. The frequency of progress events is limited to 3 times per second to avoid overwhelming consumers. An example of capturing download progress is shown below:

```js
await faxios.get(url, {
  onDownloadProgress: function (axiosProgressEvent) {
    /*{
      loaded: number;
      total?: number;
      progress?: number; // in range [0..1]
      bytes: number; // how many bytes have been transferred since the last trigger (delta)
      estimated?: number; // estimated time in seconds
      rate?: number; // download speed in bytes
      download: true; // download sign
    }*/
  },
});
```

::: warning Upload progress is not supported
The `fetch` API cannot emit upload progress events, so `onUploadProgress` is not supported. Only download progress (`onDownloadProgress`) is available.
:::
