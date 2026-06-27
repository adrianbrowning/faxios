import _FormData from "form-data";
const _F = (globalThis as { FormData?: unknown; }).FormData;
export default (_F !== undefined ? _F : _FormData) as typeof _FormData;
