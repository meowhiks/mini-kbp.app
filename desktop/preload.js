const { contextBridge, ipcRenderer } = require("electron");
const { desktopWindowTitle } = require("./windowChrome");

const TITLEBAR_HEIGHT = 42;

/** @type {{ guest: boolean, name: string, avatarUrl: string } | null} */
let chromeUser = null;

function titlebarReady() {
  return Boolean(
    document.getElementById("minikbp-titlebar") &&
      document.getElementById("minikbp-btn-close") &&
      document.getElementById("minikbp-btn-minimize") &&
      document.getElementById("minikbp-btn-maximize") &&
      document.getElementById("minikbp-titlebar-user")
  );
}

function bindTitlebarButtons() {
  document.getElementById("minikbp-btn-close")?.addEventListener("click", () => {
    ipcRenderer.send("minikbp-window-close");
  });
  document.getElementById("minikbp-btn-minimize")?.addEventListener("click", () => {
    ipcRenderer.send("minikbp-window-minimize");
  });
  document.getElementById("minikbp-btn-maximize")?.addEventListener("click", () => {
    ipcRenderer.send("minikbp-window-toggle-maximize");
  });
  document.getElementById("minikbp-titlebar-user")?.addEventListener("click", () => {
    window.dispatchEvent(
      new CustomEvent("minikbp-desktop-chrome-user", {
        detail: chromeUser || { guest: true, name: "Гость", avatarUrl: "" },
      })
    );
  });
}

function applyChromeUserDom() {
  const nameEl = document.getElementById("minikbp-titlebar-user-name");
  const avatarEl = document.getElementById("minikbp-titlebar-avatar");
  const placeholder = document.getElementById("minikbp-titlebar-avatar-ph");
  if (!nameEl || !avatarEl || !placeholder) return;

  const guest = !chromeUser || chromeUser.guest;
  const name = guest ? "Гость" : String(chromeUser.name || "Профиль").trim() || "Профиль";
  const avatarUrl = guest ? "" : String(chromeUser.avatarUrl || "").trim();

  nameEl.textContent = name;
  if (avatarUrl) {
    avatarEl.src = avatarUrl;
    avatarEl.hidden = false;
    placeholder.hidden = true;
  } else {
    avatarEl.removeAttribute("src");
    avatarEl.hidden = true;
    placeholder.hidden = false;
  }
}

function injectTitlebar() {
  if (process.platform === "linux") return;
  if (titlebarReady()) {
    applyChromeUserDom();
    return;
  }
  document.getElementById("minikbp-titlebar")?.remove();

  document.documentElement.classList.add("minikbp-desktop");

  if (!document.getElementById("minikbp-titlebar-style")) {
    const style = document.createElement("style");
    style.id = "minikbp-titlebar-style";
    style.textContent = `
html.minikbp-desktop,
html.minikbp-desktop body,
html.minikbp-desktop body * {
  -webkit-app-region: no-drag;
}
html.minikbp-desktop {
  height: 100%;
  overflow: hidden !important;
  scrollbar-width: none;
}
html.minikbp-desktop::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}
html.minikbp-desktop body {
  height: 100%;
  box-sizing: border-box;
  padding-top: ${TITLEBAR_HEIGHT}px !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  scrollbar-width: none;
}
html.minikbp-desktop body::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}
html.minikbp-desktop .min-h-dvh,
html.minikbp-desktop .min-h-screen {
  min-height: calc(100dvh - ${TITLEBAR_HEIGHT}px) !important;
}
#minikbp-titlebar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: ${TITLEBAR_HEIGHT}px;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 0 10px;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(17,24,39,0.06);
  user-select: none;
  pointer-events: auto;
}
html.dark #minikbp-titlebar,
html.theme-oled #minikbp-titlebar {
  background: rgba(24,24,27,0.94);
  border-bottom-color: rgba(255,255,255,0.08);
}
#minikbp-titlebar,
#minikbp-titlebar-left,
#minikbp-titlebar-title,
#minikbp-titlebar-logo {
  -webkit-app-region: drag;
}
#minikbp-titlebar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}
#minikbp-titlebar-user {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 220px;
  margin: 0;
  padding: 2px 8px 2px 2px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  -webkit-app-region: no-drag;
  appearance: none;
  color: inherit;
}
#minikbp-titlebar-user:hover {
  background: rgba(0, 0, 0, 0.05);
}
html.dark #minikbp-titlebar-user:hover,
html.theme-oled #minikbp-titlebar-user:hover {
  background: rgba(255, 255, 255, 0.08);
}
#minikbp-titlebar-avatar-wrap {
  position: relative;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
}
#minikbp-titlebar-avatar,
#minikbp-titlebar-avatar-ph {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  display: block;
}
#minikbp-titlebar-avatar {
  object-fit: cover;
  background: #e5e7eb;
}
#minikbp-titlebar-avatar-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(51, 144, 236, 0.15);
  color: #3390ec;
}
#minikbp-titlebar-avatar-ph svg {
  width: 16px;
  height: 16px;
}
#minikbp-titlebar-user-name {
  font-family: var(--font-manrope), "Manrope", "Segoe UI Variable", "Segoe UI", sans-serif;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
html.dark #minikbp-titlebar-user-name,
html.theme-oled #minikbp-titlebar-user-name {
  color: #f4f4f5;
}
#minikbp-titlebar-logo {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
#minikbp-titlebar-title {
  font-family: var(--font-manrope), "Manrope", "Segoe UI Variable", "Segoe UI", sans-serif;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
html.dark #minikbp-titlebar-title,
html.theme-oled #minikbp-titlebar-title,
html.dark .minikbp-titlebar-btn,
html.theme-oled .minikbp-titlebar-btn {
  color: #f4f4f5;
}
#minikbp-titlebar-actions {
  display: flex;
  align-items: stretch;
  height: 100%;
  -webkit-app-region: no-drag;
  flex-shrink: 0;
}
.minikbp-titlebar-btn {
  width: 46px;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  outline: none;
  box-shadow: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-app-region: no-drag;
  appearance: none;
  color: #111827;
}
.minikbp-titlebar-btn:focus,
.minikbp-titlebar-btn:focus-visible {
  outline: none;
  box-shadow: none;
}
.minikbp-titlebar-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}
html.dark .minikbp-titlebar-btn:hover,
html.theme-oled .minikbp-titlebar-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}
.minikbp-titlebar-btn.minikbp-close:hover {
  background: #e81123;
  color: #fff;
}
.minikbp-minus {
  width: 10px;
  height: 1.5px;
  background: currentColor;
  border-radius: 1px;
}
.minikbp-square {
  width: 10px;
  height: 10px;
  border: 1.5px solid currentColor;
  border-radius: 1px;
  background: transparent;
  box-sizing: border-box;
}
.minikbp-x {
  position: relative;
  width: 12px;
  height: 12px;
}
.minikbp-x::before,
.minikbp-x::after {
  content: "";
  position: absolute;
  left: 5px;
  top: 0;
  width: 1.5px;
  height: 12px;
  background: currentColor;
  border-radius: 1px;
}
.minikbp-x::before { transform: rotate(45deg); }
.minikbp-x::after  { transform: rotate(-45deg); }
`;
    document.documentElement.appendChild(style);
  }

  const titlebar = document.createElement("div");
  titlebar.id = "minikbp-titlebar";
  titlebar.innerHTML = `
    <div id="minikbp-titlebar-left">
      <button type="button" id="minikbp-titlebar-user" aria-label="Аккаунт">
        <span id="minikbp-titlebar-avatar-wrap">
          <img id="minikbp-titlebar-avatar" alt="" hidden />
          <span id="minikbp-titlebar-avatar-ph" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </span>
        </span>
        <span id="minikbp-titlebar-user-name">Гость</span>
      </button>
      <img id="minikbp-titlebar-logo" alt="" src="/minikbp.svg" />
      <div id="minikbp-titlebar-title"></div>
    </div>
    <div id="minikbp-titlebar-actions">
      <button class="minikbp-titlebar-btn" id="minikbp-btn-minimize" type="button" aria-label="Свернуть">
        <span class="minikbp-minus" aria-hidden="true"></span>
      </button>
      <button class="minikbp-titlebar-btn" id="minikbp-btn-maximize" type="button" aria-label="Развернуть">
        <span class="minikbp-square" aria-hidden="true"></span>
      </button>
      <button class="minikbp-titlebar-btn minikbp-close" id="minikbp-btn-close" type="button" aria-label="Закрыть">
        <span class="minikbp-x" aria-hidden="true"></span>
      </button>
    </div>
  `;

  document.documentElement.appendChild(titlebar);
  bindTitlebarButtons();
  syncWindowTitle();
  applyChromeUserDom();
}

function ensureTitlebar() {
  injectTitlebar();
  syncWindowTitle();
  applyChromeUserDom();
}

let titlebarWatching = false;

function watchTitlebar() {
  if (titlebarWatching || process.platform === "linux") return;
  titlebarWatching = true;
  const root = document.documentElement;
  const observer = new MutationObserver(() => {
    if (!titlebarReady()) ensureTitlebar();
  });
  observer.observe(root, { childList: true, subtree: true });
}

function syncWindowTitle() {
  const title = desktopWindowTitle(location.hostname);
  const el = document.getElementById("minikbp-titlebar-title");
  if (el) el.textContent = title;
  document.title = title;
  ipcRenderer.send("minikbp-set-title", title);
}

function setChromeUser(user) {
  if (!user || typeof user !== "object") {
    chromeUser = { guest: true, name: "Гость", avatarUrl: "" };
  } else {
    chromeUser = {
      guest: Boolean(user.guest),
      name: typeof user.name === "string" ? user.name : "",
      avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : user.avatarUrl == null ? "" : String(user.avatarUrl),
    };
  }
  ensureTitlebar();
  applyChromeUserDom();
}

contextBridge.exposeInMainWorld("minikbpDesktop", {
  platform: process.platform,
  customTitlebar: process.platform !== "linux",
  openExternal: (url) => {
    if (typeof url === "string") ipcRenderer.send("minikbp-open-external", url);
  },
  setChromeUser,
  navigatePath: (pathname) => {
    if (typeof pathname === "string") ipcRenderer.send("minikbp-navigate-path", pathname);
  },
});

window.addEventListener("DOMContentLoaded", () => {
  ensureTitlebar();
  watchTitlebar();
});
setTimeout(() => {
  ensureTitlebar();
  watchTitlebar();
}, 800);
