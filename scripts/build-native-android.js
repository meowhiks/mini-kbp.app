const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const androidDir = path.join(__dirname, "..", "android");
const gradle = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const task = process.argv[2] || "assembleDebug";

if (process.platform !== "win32") {
  try {
    fs.chmodSync(path.join(androidDir, "gradlew"), 0o755);
  } catch {
    /* ignore */
  }
}

const env = { ...process.env };
if (!env.ANDROID_HOME && process.env.HOME) {
  const sdk = path.join(process.env.HOME, "Android", "Sdk");
  if (fs.existsSync(sdk)) env.ANDROID_HOME = sdk;
}
if (!env.JAVA_HOME) {
  for (const j of [
    "/usr/lib/jvm/java-21-openjdk-amd64",
    "/usr/lib/jvm/java-17-openjdk-amd64",
  ]) {
    if (fs.existsSync(j)) {
      env.JAVA_HOME = j;
      break;
    }
  }
}

console.log("Bumping app version...");
execSync("node scripts/bump-version.js", {
  cwd: path.join(__dirname, ".."),
  stdio: "inherit",
});

console.log(`Native Android build: ${task}`);
if (env.ANDROID_HOME) console.log(`ANDROID_HOME=${env.ANDROID_HOME}`);
if (env.JAVA_HOME) console.log(`JAVA_HOME=${env.JAVA_HOME}`);
execSync(`${gradle} ${task}`, { cwd: androidDir, stdio: "inherit", env });
const flavor = task === "assembleRelease" ? "release" : "debug";
console.log(`\nAPK: android/app/build/outputs/apk/${flavor}/`);
