const LOCAL_SCHEME = "minikbp";

function rewriteApexToLkUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "mini-kbp.site" || host === "www.mini-kbp.site") {
      parsed.hostname = "lk.mini-kbp.site";
      return parsed.toString();
    }
  } catch {
    return url;
  }
  return url;
}

/** Apex/www → локальный bundle (тот же path), иначе lk. */
function rewriteApexToLocalBundle(url, localOrigin = "minikbp://bundle") {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "mini-kbp.site" || host === "www.mini-kbp.site") {
      const base = localOrigin.replace(/\/+$/, "");
      const path = `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
      return `${base}${path.startsWith("/") ? path : `/${path}`}`;
    }
  } catch {
    return url;
  }
  return url;
}

function classifyDesktopNavigation(url) {
  if (!url || typeof url !== "string") return "ignore";
  if (/^(tg|telegram):/i.test(url)) return "protocol";
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.replace(/:$/, "").toLowerCase();
    if (protocol === LOCAL_SCHEME) return "app";

    const host = parsed.hostname.toLowerCase();
    if (host === "oauth.telegram.org") return "telegram-oauth";
    if (host === "mini-kbp.site" || host === "www.mini-kbp.site") return "apex";
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "lk.mini-kbp.site" ||
      host === "panel.mini-kbp.site" ||
      host === "bundle"
    ) {
      return "app";
    }
  } catch {
    return "external";
  }
  return "external";
}

module.exports = {
  LOCAL_SCHEME,
  classifyDesktopNavigation,
  rewriteApexToLkUrl,
  rewriteApexToLocalBundle,
};
