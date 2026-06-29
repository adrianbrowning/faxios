# 进度捕获 <Badge type="tip" text="新特性" />

faxios 支持在所有运行时中捕获请求的下载进度。进度事件的触发频率被限制为每秒最多 3 次，以避免被过多的进度事件压垮。以下是捕获进度事件的示例：

```js
await faxios.post(url, data, {
  onDownloadProgress: function (axiosProgressEvent) {
    /*{
      loaded: number;
      total?: number;
      progress?: number;
      bytes: number; 
      estimated?: number;
      rate?: number; // 下载速度（字节/秒）
      download: true; // 下载标识
    }*/
  },
});
```

::: warning
fetch 无法报告上传进度，因此 faxios 不支持 `onUploadProgress`，仅支持通过 `onDownloadProgress` 捕获下载进度。
:::
