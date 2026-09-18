const fs = require("fs");
const path = require("path");

const rawDir = path.join(__dirname, "../app/src/main/res/raw");
const drawDir = path.join(__dirname, "../app/src/main/res/drawable");
const map = {
  sym_settings: "ic_nav_settings",
  sym_calendar_today: "ic_nav_calendar",
  sym_menu_book: "ic_nav_journal",
  sym_person: "ic_nav_profile",
  sym_mail: "ic_mail",
  sym_lock: "ic_lock",
  sym_logout: "ic_logout",
  sym_palette: "ic_palette",
  sym_notifications: "ic_notifications",
  sym_refresh: "ic_refresh",
};

for (const [src, dst] of Object.entries(map)) {
  const svgPath = path.join(rawDir, src + ".svg");
  const svg = fs.readFileSync(svgPath, "utf8");
  const m = svg.match(/d="([^"]+)"/);
  if (!m) {
    console.error("no path in", src);
    process.exitCode = 1;
    continue;
  }
  const xml =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n' +
    '    android:width="24dp"\n' +
    '    android:height="24dp"\n' +
    '    android:viewportWidth="24"\n' +
    '    android:viewportHeight="24">\n' +
    '    <path\n' +
    '        android:fillColor="#000000"\n' +
    '        android:pathData="' +
    m[1] +
    '" />\n' +
    "</vector>\n";
  fs.writeFileSync(path.join(drawDir, dst + ".xml"), xml);
  console.log("wrote", dst);
}
