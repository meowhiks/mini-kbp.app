/** Человекочитаемое имя сеанса из User-Agent. */

type SessionLike = { user_agent?: string; device_kind?: string };

function cleanAndroidModel(raw: string): string {
  return raw.replace(/\s+Build\/.*$/i, "").replace(/\s+/g, " ").trim();
}

function browserName(ua: string): string | null {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  return null;
}

export function sessionTitle(session: SessionLike): string {
  const ua = (session.user_agent || "").trim();

  const android = ua.match(/Android\s+[\d.]+;\s*([^;)]+)/i);
  if (android) {
    const model = cleanAndroidModel(android[1]);
    if (model && !/^Linux$/i.test(model)) return `Android ${model}`;
    return "Android";
  }

  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPod/i.test(ua)) return "iPod";

  const browser = browserName(ua);
  if (browser) return browser;

  if (session.device_kind === "mobile") return "Телефон";
  if (session.device_kind === "desktop") return "ПК";
  return "Браузер";
}

export function formatSessionIp(ip: string | null | undefined): string {
  const raw = (ip || "").trim();
  if (!raw) return "—";
  return raw;
}
