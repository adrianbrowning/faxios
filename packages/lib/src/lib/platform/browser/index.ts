import Blob from "./classes/Blob.js";
import FormData from "./classes/FormData.js";
import URLSearchParams from "./classes/URLSearchParams.js";

export default {
  isBrowser: true,
  classes: {
    URLSearchParams,
    FormData,
    Blob,
  },
  protocols: [ "http", "https", "file", "blob", "url", "data" ],
};
