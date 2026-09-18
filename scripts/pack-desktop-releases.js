/**
 * Pack Electron desktop for Linux + Windows and publish into public/downloads/.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const desktopDir = path.join(root, "desktop");
const releaseDir = path.join(desktopDir, "release");
const downloadsDir = path.join(root, "public", "downloads");
const buildDir = path.join(desktopDir, "build");
const pkg = JSON.parse(fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"));
const version = pkg.version;

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: opts.cwd || root, env: { ...process.env, ...opts.env } });
}

function ensureIcon() {
  fs.mkdirSync(buildDir, { recursive: true });
  const png = path.join(buildDir, "icon.png");
  const svg = path.join(root, "public", "icon-no-bg.svg");
  if (fs.existsSync(png) && fs.statSync(png).mtimeMs >= fs.statSync(svg).mtimeMs) return;
  console.log("Generating desktop/build/icon.png…");
  execSync(`convert -background none "${svg}" -resize 512x512 "${png}"`, { stdio: "inherit" });
}

function copyNamed(srcName, destName) {
  const src = path.join(releaseDir, srcName);
  if (!fs.existsSync(src)) {
    console.warn(`skip missing ${srcName}`);
    return null;
  }
  const dest = path.join(downloadsDir, destName);
  fs.copyFileSync(src, dest);
  console.log(`published ${destName} (${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)} MB)`);
  return dest;
}

function findArtifact(predicate) {
  if (!fs.existsSync(releaseDir)) return null;
  return fs.readdirSync(releaseDir).find(predicate) || null;
}

fs.mkdirSync(downloadsDir, { recursive: true });
ensureIcon();

if (!fs.existsSync(path.join(root, "out", "index.html"))) {
  console.log("out/ missing — running build:desktop…");
  run("npm run build:desktop");
}

run("npm install", { cwd: desktopDir });
run("npx electron-builder --linux AppImage deb --win zip", { cwd: desktopDir });

const linuxAppImage =
  findArtifact((n) => n.endsWith(".AppImage") && n.includes(version)) ||
  findArtifact((n) => n.endsWith(".AppImage"));
const linuxDeb =
  findArtifact((n) => n.endsWith(".deb") && n.includes(version)) ||
  findArtifact((n) => n.endsWith(".deb"));
const winZip =
  findArtifact((n) => n.endsWith(".zip") && /win/i.test(n)) ||
  findArtifact((n) => n.endsWith(".zip"));

if (linuxAppImage) {
  copyNamed(linuxAppImage, `mini-kbp-${version}-linux-x64.AppImage`);
  copyNamed(linuxAppImage, "mini-kbp-latest-linux-x64.AppImage");
}
if (linuxDeb) {
  copyNamed(linuxDeb, `mini-kbp-${version}-linux-amd64.deb`);
  copyNamed(linuxDeb, "mini-kbp-latest-linux-amd64.deb");
}
if (winZip) {
  copyNamed(winZip, `mini-kbp-${version}-win-x64.zip`);
  copyNamed(winZip, "mini-kbp-latest-win-x64.zip");
}

// Keep APK latest + versioned aliases if debug apk exists
const debugApk = path.join(downloadsDir, "minikbp-debug.apk");
const latestApk = path.join(downloadsDir, "mini-kbp-latest.apk");
const versionedApk = path.join(downloadsDir, `mini-kbp-${version}.apk`);
if (fs.existsSync(debugApk)) {
  fs.copyFileSync(debugApk, latestApk);
  fs.copyFileSync(debugApk, versionedApk);
  console.log(`published mini-kbp-latest.apk + mini-kbp-${version}.apk (from minikbp-debug.apk)`);
}

console.log("Desktop releases ready in public/downloads/");
