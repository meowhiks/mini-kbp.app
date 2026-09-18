/**
 * Ensure static export exists, then start Electron.
 * Fixes plain "Not found" when out/ was never built.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const indexHtml = path.join(root, "out", "index.html");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, shell: process.platform === "win32", ...opts });
  if (r.error) throw r.error;
  if (r.status) process.exit(r.status);
}

if (!fs.existsSync(indexHtml)) {
  console.log("[desktop] out/ missing — running npm run build:desktop…");
  run("npm", ["run", "build:desktop"]);
  if (!fs.existsSync(indexHtml)) {
    console.error("[desktop] out/index.html still missing after build:desktop");
    process.exit(1);
  }
}

run("npm", ["start", "--prefix", "desktop"]);
