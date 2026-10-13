import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import url from "node:url";
import minimist from "minimist";

const argv = minimist(process.argv.slice(2));
let server;
let dirs;

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function listDirs(root) {
  const files = fs.readdirSync(root);
  const dirs = [];

  for (let i = 0, l = files.length; i < l; i++) {
    const file = files[i];
    if (file[0] !== ".") {
      const stat = fs.statSync(path.join(root, file));
      if (stat.isDirectory()) {
        dirs.push(file);
      }
    }
  }

  return dirs;
}

function getIndexTemplate() {
  const links = dirs.map(function (dir) {
    const url = "/" + dir;
    return (
      "<li onclick=\"document.location='" + url + "'\"><a href=\"" + url + "\">" + url + "</a></li>"
    );
  });

  return (
    "<!doctype html>" +
    "<html>" +
    "<head>" +
    "<title>faxios examples</title>" +
    "<style>" +
    "body {padding:25px;}" +
    "ul {margin:0; padding:0; list-style:none;}" +
    "li {padding:5px 10px;}" +
    "li:hover {background:#eee; cursor:pointer;}" +
    "a {text-decoration:none; color:#0080ff;}" +
    "</style>" +
    "<body>" +
    "<ul>" +
    links.join("") +
    "</ul>"
  );
}

function sendResponse(res, statusCode, body) {
  res.writeHead(statusCode);
  res.write(body);
  res.end();
}

function send200(res, body) {
  sendResponse(res, 200, body || "<h1>OK</h1>");
}

function send404(res, body) {
  sendResponse(res, 404, body || "<h1>Not Found</h1>");
}

const LIB_DIST = path.resolve(__dirname, "../lib/dist");
const LIB_PREFIX = "/faxios/";
const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".map": "application/json",
};

/**
 * Streams `file` if it resolves inside `root`, so a request can never reach outside it.
 */
function pipeFileToResponse(res, root, file) {
  try {
    const resolvedPath = path.resolve(root, "." + path.sep + file);

    if (resolvedPath !== root && !resolvedPath.startsWith(root + path.sep)) {
      res.writeHead(400);
      res.end("Invalid file path");
      return;
    }

    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      send404(res);
      return;
    }

    const type = MIME_TYPES[path.extname(resolvedPath)];
    res.writeHead(200, type ? { "Content-Type": type } : {});

    const stream = fs.createReadStream(resolvedPath);

    stream.on("error", err => {
      console.error("Error while reading file:", err.message);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" });
      }
      res.end("File read error");
    });

    stream.pipe(res);
  }
  catch (err) {
    console.error("Unexpected error:", err.message);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
    }
    res.end("Internal server error");
  }
}

dirs = listDirs(__dirname).filter(dir => fs.existsSync(path.join(__dirname, dir, "index.html")));

server = http.createServer(function (req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  }
  catch {
    sendResponse(res, 400, "Invalid URL");
    return;
  }

  // The local faxios build, imported by the pages through their import map
  if (pathname.startsWith(LIB_PREFIX)) {
    pipeFileToResponse(res, LIB_DIST, pathname.slice(LIB_PREFIX.length));
    return;
  }

  if (pathname === "/" || pathname === "/index.html") {
    send200(res, getIndexTemplate());
    return;
  }

  // /get, /get/ and /get/index.html serve the example page; /get/server runs its handler
  const [ dir, file = "", ...rest ] = pathname.slice(1).split("/");
  if (!dirs.includes(dir) || rest.length > 0) {
    send404(res);
    return;
  }

  if (file === "" || file === "index.html") {
    pipeFileToResponse(res, path.join(__dirname, dir), "index.html");
    return;
  }

  const handler = path.join(__dirname, dir, "server.js");
  if (file === "server" && fs.existsSync(handler)) {
    import(url.pathToFileURL(handler).href)
      .then(module => module.default(req, res))
      .catch(err => {
        console.error("Error importing server:", err);
        send404(res);
      });
    return;
  }

  send404(res);
});

const PORT = argv.p || 3000;

server.listen(PORT, () => {
  console.log(`Examples running on ${PORT}`);
});
