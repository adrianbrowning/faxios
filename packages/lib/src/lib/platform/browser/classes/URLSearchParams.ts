"use strict";

import FaxiosURLSearchParams from "../../../helpers/FaxiosURLSearchParams.js";
export default typeof URLSearchParams !== "undefined" ? URLSearchParams : FaxiosURLSearchParams;
