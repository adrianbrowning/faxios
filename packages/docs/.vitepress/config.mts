import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config

// GitHub Pages project site: https://adrianbrowning.github.io/faxios/
const base = "/faxios/";
const repoURL = "https://github.com/adrianbrowning/faxios";

const nav = [
  { text: "Guide", link: "/pages/getting-started/first-steps" },
  { text: "API", link: "/pages/advanced/api-reference" },
  { text: "Changelog", link: `${repoURL}/blob/main/CHANGELOG.md` },
];

const sidebar = [
  {
    text: "Getting Started",
    items: [
      { text: "First steps", link: "/pages/getting-started/first-steps" },
      { text: "Features", link: "/pages/getting-started/features" },
      {
        text: "Examples",
        items: [
          {
            text: "JavaScript",
            link: "/pages/getting-started/examples/commonjs",
          },
          {
            text: "TypeScript",
            link: "/pages/getting-started/examples/typescript",
          },
        ],
      },
      {
        text: "Upgrade guide v0.x -> v1.x",
        link: "/pages/getting-started/upgrade-guide",
      },
    ],
  },
  {
    text: "Advanced",
    items: [
      { text: "Public API", link: "/pages/advanced/api-reference" },
      {
        text: "Request method aliases",
        link: "/pages/advanced/request-method-aliases",
      },
      {
        text: "Creating an instance",
        link: "/pages/advanced/create-an-instance",
      },
      { text: "Typed endpoints: define()", link: "/pages/advanced/define" },
      { text: "Route builder: route()", link: "/pages/advanced/route" },
      { text: "Request config", link: "/pages/advanced/request-config" },
      { text: "Response schema", link: "/pages/advanced/response-schema" },
      { text: "Schema validation", link: "/pages/advanced/schema-validation" },
      { text: "Config defaults", link: "/pages/advanced/config-defaults" },
      { text: "Interceptors", link: "/pages/advanced/interceptors" },
      { text: "Error handling", link: "/pages/advanced/error-handling" },
      { text: "Cancellation", link: "/pages/advanced/cancellation" },
      { text: "Authentication", link: "/pages/advanced/authentication" },
      { text: "Retry & error recovery", link: "/pages/advanced/retry" },
      { text: "Testing", link: "/pages/advanced/testing" },
      {
        text: "x-www-form-urlencoded format",
        link: "/pages/advanced/x-www-form-urlencoded-format",
      },
      {
        text: "Multipart/form-data format",
        link: "/pages/advanced/multipart-form-data-format",
      },
      { text: "File posting", link: "/pages/advanced/file-posting" },
      {
        text: "HTML form processing 🔥",
        link: "/pages/advanced/html-form-processing",
      },
      {
        text: "Progress capturing 🔥",
        link: "/pages/advanced/progress-capturing",
      },
      {
        text: "Headers 🔥",
        items: [
          { text: "General usage", link: "/pages/advanced/headers" },
          { text: "Methods", link: "/pages/advanced/header-methods" },
        ],
      },
      { text: "Fetch adapter 🔥", link: "/pages/advanced/fetch-adapter" },
      { text: "Promises", link: "/pages/advanced/promises" },
      { text: "TypeScript", link: "/pages/advanced/type-script" },
    ],
  },
  {
    text: "Miscellaneous",
    items: [
      { text: "SemVer", link: "/pages/misc/semver" },
      { text: "Security", link: "/pages/misc/security" },
    ],
  },
];

export default defineConfig({
  base,
  cleanUrls: true,
  lang: "en-US",
  title: "faxios | Promise based HTTP client",
  description: "Documentation for the faxios HTTP client",
  // The es/fr/zh translations are axios-era and behind the English pages, and
  // the sponsors data is axios's. Keep them out of the site until updated.
  srcExclude: ["es/**", "fr/**", "zh/**", "pages/misc/sponsors.md"],
  head: [
    ["link", { rel: "icon", href: `${base}favicon.ico` }],
    [
      "link",
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: `${base}apple-touch-icon.png`,
      },
    ],
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: `${base}favicon-32x32.png`,
      },
    ],
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: `${base}favicon-16x16.png`,
      },
    ],
    ["link", { rel: "manifest", href: `${base}site.webmanifest` }],
  ],
  themeConfig: {
    nav,
    sidebar,
    // The bundled logo and wordmark SVGs are axios's; use a text title until faxios has its own.
    siteTitle: "faxios",
    socialLinks: [{ icon: "github", link: repoURL }],
    footer: {
      message: "faxios is provided under the MIT license",
      copyright: "Copyright © 2014-present Matt Zabriskie & Collaborators",
    },
  },
});
