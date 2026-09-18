const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function resolveOutDir() {
  const fromEnv = process.env.MINIKBP_DESKTOP_OUT;
  if (fromEnv && fs.existsSync(fromEnv)) return path.resolve(fromEnv);
  const candidates = [
    // Packaged Electron: extraResources → resources/out
    path.join(process.resourcesPath || "", "out"),
    path.join(__dirname, "www"),
    path.join(__dirname, "..", "out"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, "index.html"))) return c;
  }
  return path.join(__dirname, "..", "out");
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath || "/");
  const cleaned = decoded.replace(/^\/+/, "").replace(/\\/g, "/");
  const abs = path.normalize(path.join(root, cleaned));
  if (!abs.startsWith(path.normalize(root))) return null;
  return abs;
}

function candidatesFor(root, pathname) {
  const p = pathname === "/" || pathname === "" ? "/index.html" : pathname;
  const list = [];
  const base = safeJoin(root, p);
  if (base) list.push(base);
  if (!p.endsWith("/") && !path.extname(p)) {
    const asHtml = safeJoin(root, `${p}.html`);
    const asIndex = safeJoin(root, path.join(p, "index.html"));
    if (asHtml) list.push(asHtml);
    if (asIndex) list.push(asIndex);
  } else if (p.endsWith("/")) {
    const asIndex = safeJoin(root, path.join(p, "index.html"));
    if (asIndex) list.push(asIndex);
  }
  return list;
}

function resolveStaticFile(root, pathname) {
  for (const file of candidatesFor(root, pathname)) {
    try {
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    } catch {
      // continue
    }
  }
  return null;
}

function contentTypeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

/** @returns {Promise<Response>} */
async function serveStaticRequest(requestUrl, outDir) {
  let pathname = "/";
  try {
    pathname = new URL(requestUrl).pathname || "/";
  } catch {
    pathname = "/";
  }

  let file = resolveStaticFile(outDir, pathname);
  if (!file && pathname !== "/404.html") {
    file = resolveStaticFile(outDir, "/404.html") || resolveStaticFile(outDir, "/index.html");
  }
  if (!file) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }

  const data = fs.readFileSync(file);
  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": contentTypeFor(file),
      "Cache-Control": pathname.startsWith("/_next/") ? "public, max-age=31536000, immutable" : "no-cache",
    },
  });
}

function fileUrlFor(filePath) {
  return pathToFileURL(filePath).toString();
}

module.exports = {
  resolveOutDir,
  resolveStaticFile,
  serveStaticRequest,
  fileUrlFor,
};
