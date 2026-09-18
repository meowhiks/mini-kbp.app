const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

export async function fetchKbpText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ru,en;q=0.9",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 403) {
    const err = new Error("KBP_403");
    err.code = "KBP_403";
    throw err;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}
