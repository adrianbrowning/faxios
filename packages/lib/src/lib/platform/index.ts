import platform from "./browser/index.js";
import * as utils from "./common/utils.js";

export default {
  ...utils,
  ...platform,
};
