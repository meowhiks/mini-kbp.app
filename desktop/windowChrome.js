function desktopWindowTitle(hostname) {
  const host = String(hostname || "")
    .split(":")[0]
    .toLowerCase();
  if (host === "panel.mini-kbp.site") return "Панель администратора";
  return "Мини КБиП";
}

module.exports = { desktopWindowTitle };

