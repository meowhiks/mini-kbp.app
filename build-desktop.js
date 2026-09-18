/**
 * Static export for Electron (локальный UI).
 * Без Capacitor sync — только out/ + NEXT_PUBLIC_MINIKBP_SERVER_URL на прод.
 */
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

console.log("UI bundled in Electron — API → lk.mini-kbp.site / api.mini-kbp.site");

try {
  if (fs.existsSync(outDir)) {
    console.log("Cleaning out/ (fresh static export)...");
    fs.rmSync(outDir, { recursive: true, force: true });
  }

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

  console.log("Building static export for desktop...");
  const desktopEnv = {
    ...process.env,
    MOBILE_BUILD: "1",
    NEXT_PUBLIC_MINIKBP_SERVER_URL:
      process.env.NEXT_PUBLIC_MINIKBP_SERVER_URL || "https://lk.mini-kbp.site",
  };
  if (/localhost|127\.0\.0\.1/i.test(desktopEnv.NEXT_PUBLIC_MINIKBP_SERVER_URL)) {
    console.log("NEXT_PUBLIC_MINIKBP_SERVER_URL → https://lk.mini-kbp.site (desktop build override)");
    desktopEnv.NEXT_PUBLIC_MINIKBP_SERVER_URL = "https://lk.mini-kbp.site";
  }
  execSync("npm run build", { stdio: "inherit", env: desktopEnv });

  if (!fs.existsSync(path.join(outDir, "index.html"))) {
    throw new Error("out/index.html not found after build");
  }

  fs.writeFileSync(path.join(outDir, ".build-stamp"), `${new Date().toISOString()}\ndesktop\n`, "utf8");
  buildOk = true;
} catch (err) {
  console.error("\n[build:desktop] FAILED — out/ was not updated.");
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

console.log("Desktop static export ready: out/");
