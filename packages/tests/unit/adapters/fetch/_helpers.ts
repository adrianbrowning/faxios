import faxios from "#src/index.js";

// Tests that hit a real server start it on port 0 and pass the bound URL. Relative URLs and
// this placeholder base only ever reach a mocked `fetch`.
export const fetchFaxios = faxios.create({
  baseURL: "http://localhost",
  allowAbsoluteUrls: true,
});
