#!/usr/bin/env node
/**
 * Bump patch version: 0.3.13 → 0.3.14
 * Updates package.json, lib/client/appVersion.ts, android/app/build.gradle
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const appVersionPath = path.join(root, "lib", "client", "appVersion.ts");
const gradlePath = path.join(root, "android", "app", "build.gradle");

function bumpSemver(v) {
  const parts = String(v).trim().split(".").map((x) => parseInt(x, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid version: ${v}`);
  }
  parts[2] += 1;
  return parts.join(".");
}

function versionCodeFromName(version) {
  const [a, b, c] = version.split(".").map((x) => parseInt(x, 10));
  return a * 10000 + b * 100 + c;
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const next = bumpSemver(pkg.version || "0.0.0");
pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

let appVersionSrc = fs.readFileSync(appVersionPath, "utf8");
appVersionSrc = appVersionSrc.replace(
  /export const APP_VERSION = "[^"]+";/,
  `export const APP_VERSION = "${next}";`
);
fs.writeFileSync(appVersionPath, appVersionSrc);

if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, "utf8");
  const code = versionCodeFromName(next);
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${code}`);
  gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${next}"`);
  fs.writeFileSync(gradlePath, gradle);
}

console.log(`[bump-version] ${next} (versionCode ${versionCodeFromName(next)})`);
