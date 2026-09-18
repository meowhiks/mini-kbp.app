const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const apiDir = path.join(__dirname, "app", "api");
const apiBackupDir = path.join(__dirname, "app", "_api_backup");
const apiBakDir = path.join(__dirname, "app", "api.bak");
const apiBakBackupDir = path.join(__dirname, "app", "_api_bak_backup");
const outDir = path.join(__dirname, "out");
const nextDir = path.join(__dirname, ".next");

const hasApiDir = fs.existsSync(apiDir);
const hasApiBakDir = fs.existsSync(apiBakDir);

let buildOk = false;

// Production APK: UI из out/ внутри APK (без server.url).
// Live reload: CAP_SERVER_URL=http://192.168.x.x:3000 npm run build:android
if (process.env.CAP_SERVER_URL) {
  console.log(`CAP_SERVER_URL → ${process.env.CAP_SERVER_URL} (live reload, UI с ПК)`);
} else {
  console.log("UI bundled in APK — не зависит от lk.mini-kbp.site / tunnel");
}

try {
  console.log("Bumping app version...");
  execSync("node scripts/bump-version.js", { stdio: "inherit" });

  if (fs.existsSync(outDir)) {
    console.log("Cleaning out/ (fresh static export)...");
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  // Не трогаем .next/dev — иначе docker `next dev` не может создать dev/logs.
  if (fs.existsSync(nextDir)) {
    for (const sub of ["types", "cache"]) {
      const p = path.join(nextDir, sub);
      if (fs.existsSync(p)) {
        console.log(`Cleaning ${path.relative(__dirname, p)}/...`);
        fs.rmSync(p, { recursive: true, force: true });
      }
    }
  }

  if (hasApiDir) {
    console.log("Moving app/api to app/_api_backup...");
    fs.renameSync(apiDir, apiBackupDir);
  }
  if (hasApiBakDir) {
    console.log("Moving app/api.bak to app/_api_bak_backup...");
    fs.renameSync(apiBakDir, apiBakBackupDir);
  }

  console.log("Building static export...");
  // Явно прод-URL: .env.local с localhost не должен попасть в APK
  const mobileEnv = {
    ...process.env,
    MOBILE_BUILD: "1",
    NEXT_PUBLIC_MINIKBP_SERVER_URL:
      process.env.NEXT_PUBLIC_MINIKBP_SERVER_URL || "https://lk.mini-kbp.site",
  };
  if (/localhost|127\.0\.0\.1/i.test(mobileEnv.NEXT_PUBLIC_MINIKBP_SERVER_URL)) {
    console.log("NEXT_PUBLIC_MINIKBP_SERVER_URL → https://lk.mini-kbp.site (mobile build override)");
    mobileEnv.NEXT_PUBLIC_MINIKBP_SERVER_URL = "https://lk.mini-kbp.site";
  }
  execSync("npm run build", { stdio: "inherit", env: mobileEnv });

  if (!fs.existsSync(path.join(outDir, "index.html"))) {
    throw new Error("out/index.html not found after build");
  }

  // Heavy installers must not ship inside the APK web assets.
  const downloadsOut = path.join(outDir, "downloads");
  if (fs.existsSync(downloadsOut)) {
    console.log("Removing out/downloads to shrink APK...");
    fs.rmSync(downloadsOut, { recursive: true, force: true });
  }

  fs.writeFileSync(
    path.join(outDir, ".build-stamp"),
    `${new Date().toISOString()}\n`,
    "utf8"
  );
  buildOk = true;
} catch (err) {
  console.error("\n[build:mobile] FAILED — out/ was not updated. Do not run cap:sync.");
  const code = err && typeof err === "object" && "status" in err ? Number(err.status) || 1 : 1;
  process.exit(code);
} finally {
  if (hasApiDir && fs.existsSync(apiBackupDir)) {
    console.log("Restoring app/api...");
    fs.renameSync(apiBackupDir, apiDir);
  }
  if (hasApiBakDir && fs.existsSync(apiBakBackupDir)) {
    console.log("Restoring app/api.bak...");
    fs.renameSync(apiBakBackupDir, apiBakDir);
  }
}

if (!buildOk) {
  process.exit(1);
}

console.log(
  process.env.CAP_SERVER_URL
    ? `Build complete! Syncing Capacitor (live reload: ${process.env.CAP_SERVER_URL})...`
    : "Build complete! Syncing Capacitor (bundled UI)..."
);
execSync("npx cap sync", { stdio: "inherit", env: process.env });
console.log("Cap sync done.");
