const { app, BrowserWindow, shell, ipcMain, Menu, session, protocol } = require("electron");
const fs = require("fs");
const path = require("path");
const {
  classifyDesktopNavigation,
  rewriteApexToLkUrl,
  rewriteApexToLocalBundle,
  LOCAL_SCHEME,
} = require("./navigationPolicy");
const { resolveOutDir, serveStaticRequest } = require("./staticServer");

const LIVE_RELOAD_URL = process.env.MINIKBP_DESKTOP_URL || "";
const LOCAL_ORIGIN = `${LOCAL_SCHEME}://bundle`;
const DEFAULT_START_PATH = "/app";
const useCustomTitlebar = process.platform !== "linux";
const useLocalBundle = !LIVE_RELOAD_URL;

let mainWindow = null;
let userRequestedClose = false;
let outDir = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: false,
    },
  },
]);

function desktopLog(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  process.stderr.write(`[minikbp-desktop] ${message}\n`);
  try {
    fs.appendFileSync(path.join(app.getPath("userData"), "desktop.log"), line);
  } catch {
    // ignore log IO errors
  }
}

function startUrl() {
  if (LIVE_RELOAD_URL) return LIVE_RELOAD_URL;
  return `${LOCAL_ORIGIN}${DEFAULT_START_PATH}`;
}

function homeUrl() {
  if (LIVE_RELOAD_URL) {
    try {
      return new URL("/", LIVE_RELOAD_URL).toString();
    } catch {
      return LIVE_RELOAD_URL;
    }
  }
  return `${LOCAL_ORIGIN}${DEFAULT_START_PATH}`;
}

function mapNavigationTarget(url) {
  const kind = classifyDesktopNavigation(url);
  if (kind === "apex") {
    return useLocalBundle ? rewriteApexToLocalBundle(url, LOCAL_ORIGIN) : rewriteApexToLkUrl(url);
  }
  return url;
}

function openExternalSafe(url) {
  desktopLog(`openExternal ${url}`);
  void shell.openExternal(url);
}

function loadInMain(url) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  desktopLog(`load main ${url}`);
  void mainWindow.loadURL(url);
}

function attachContentsGuards(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    const kind = classifyDesktopNavigation(url);
    desktopLog(`window.open ${kind} ${url}`);
    if (kind === "protocol" || kind === "telegram-oauth") {
      openExternalSafe(url);
      return { action: "deny" };
    }
    if (kind === "apex" || kind === "app") {
      loadInMain(mapNavigationTarget(url));
      return { action: "deny" };
    }
    openExternalSafe(url);
    return { action: "deny" };
  });

  contents.on("will-navigate", (event, url) => {
    const kind = classifyDesktopNavigation(url);
    const owner = BrowserWindow.fromWebContents(contents);

    if (kind === "protocol" || kind === "telegram-oauth") {
      event.preventDefault();
      openExternalSafe(url);
      return;
    }

    if (kind === "apex") {
      event.preventDefault();
      loadInMain(mapNavigationTarget(url));
      if (owner && mainWindow && owner !== mainWindow) owner.close();
      return;
    }

    if (kind === "app" && owner && mainWindow && owner !== mainWindow) {
      event.preventDefault();
      loadInMain(url);
      owner.close();
      return;
    }

    if (kind === "external") {
      event.preventDefault();
      openExternalSafe(url);
    }
  });

  contents.on("will-redirect", (event, url) => {
    const kind = classifyDesktopNavigation(url);
    const owner = BrowserWindow.fromWebContents(contents);

    if (kind === "protocol") {
      event.preventDefault();
      openExternalSafe(url);
      return;
    }

    if (kind === "apex") {
      event.preventDefault();
      loadInMain(mapNavigationTarget(url));
      if (owner && mainWindow && owner !== mainWindow) owner.close();
      return;
    }

    if (kind === "app" && owner && mainWindow && owner !== mainWindow) {
      event.preventDefault();
      loadInMain(url);
      owner.close();
      return;
    }

    if (kind === "external") {
      event.preventDefault();
      openExternalSafe(url);
    }
  });
}

ipcMain.on("minikbp-open-external", (_event, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) return;
  openExternalSafe(url.trim());
});

ipcMain.on("minikbp-set-title", (e, title) => {
  if (typeof title !== "string" || !title.trim()) return;
  const win = BrowserWindow.fromWebContents(e.sender);
  win?.setTitle(title.trim());
});

ipcMain.on("minikbp-window-close", (e) => {
  userRequestedClose = true;
  const win = BrowserWindow.fromWebContents(e.sender);
  win?.close();
});

ipcMain.on("minikbp-window-minimize", (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  win?.minimize();
});

ipcMain.on("minikbp-window-toggle-maximize", (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on("minikbp-navigate-path", (e, pathname) => {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return;
  const target = useLocalBundle ? `${LOCAL_ORIGIN}${pathname}` : new URL(pathname, homeUrl()).toString();
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && !win.isDestroyed()) void win.loadURL(target);
});

function installEditMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

function registerLocalProtocol() {
  outDir = resolveOutDir();
  desktopLog(`static root ${outDir}`);
  if (!fs.existsSync(path.join(outDir, "index.html"))) {
    desktopLog("WARN: out/index.html missing — run npm run build:desktop");
  }

  protocol.handle(LOCAL_SCHEME, async (request) => {
    try {
      return await serveStaticRequest(request.url, outDir);
    } catch (err) {
      desktopLog(`static serve error ${err && err.message ? err.message : err}`);
      return new Response("Internal error", { status: 500, headers: { "Content-Type": "text/plain" } });
    }
  });
}

function createWindow() {
  userRequestedClose = false;
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    frame: !useCustomTitlebar,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: process.platform !== "linux",
    },
  });
  mainWindow = win;

  win.setMenuBarVisibility(false);
  const url = startUrl();
  desktopLog(`start ${url}${useLocalBundle ? " (local bundle)" : " (live reload)"}`);
  void win.loadURL(url);

  win.webContents.on("context-menu", (_event, params) => {
    if (!params.isEditable && !params.selectionText) return;
    const items = [];
    if (params.isEditable) {
      items.push({ role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" });
    } else {
      items.push({ role: "copy" });
    }
    Menu.buildFromTemplate(items).popup({ window: win });
  });

  win.on("close", (event) => {
    if (userRequestedClose) return;
    const currentUrl = win.webContents.getURL();
    if (classifyDesktopNavigation(currentUrl) === "telegram-oauth") {
      desktopLog("blocked Telegram window.close on main window");
      event.preventDefault();
      loadInMain(homeUrl());
    }
  });

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
}

app.on("web-contents-created", (_event, contents) => {
  attachContentsGuards(contents);
});

app.on("render-process-gone", (_event, _wc, details) => {
  desktopLog(`render-process-gone ${JSON.stringify(details)}`);
});

app.on("child-process-gone", (_event, details) => {
  desktopLog(`child-process-gone ${JSON.stringify(details)}`);
});

process.on("uncaughtException", (err) => {
  desktopLog(`uncaughtException ${err && err.stack ? err.stack : err}`);
});

app.whenReady().then(() => {
  if (useLocalBundle) registerLocalProtocol();
  installEditMenu();
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === "clipboard-read" || permission === "clipboard-sanitized-write") {
      callback(true);
      return;
    }
    callback(false);
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
