const ALLOWED = /^https:\/\/kbp\.by\//;

/** @type {{ accepted: boolean; workerId: string; relayBase: string }} */
let state = {
  accepted: false,
  workerId: "",
  relayBase: "https://mini-kbp.site",
};

async function loadState() {
  const stored = await chrome.storage.local.get(["relayConsent", "relayBase"]);
  if (stored.relayConsent) {
    state.accepted = Boolean(stored.relayConsent.accepted);
    state.workerId = String(stored.relayConsent.workerId || "");
  }
  if (stored.relayBase) state.relayBase = String(stored.relayBase);
}

async function saveConsent(consent) {
  state.accepted = Boolean(consent?.accepted);
  state.workerId = String(consent?.workerId || state.workerId || crypto.randomUUID());
  await chrome.storage.local.set({ relayConsent: { accepted: state.accepted, workerId: state.workerId } });
  if (state.accepted) {
    chrome.alarms.create("relay-poll", { periodInMinutes: 0.5 });
    pollRelayWork();
  } else {
    chrome.alarms.clear("relay-poll");
  }
}

async function fetchKbp(url, init) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ...(init?.headers || {}),
  };
  const host = new URL(url).hostname;
  if (host === "kbp.by") headers.Referer = "https://kbp.by/";

  const res = await fetch(url, {
    method: init?.method || "GET",
    headers,
    body: init?.method === "POST" ? init.body : undefined,
    credentials: "omit",
    cache: "no-store",
  });

  const data = await res.text();
  const outHeaders = {};
  res.headers.forEach((v, k) => {
    outHeaders[k.toLowerCase()] = v;
  });

  return { status: res.status, headers: outHeaders, data };
}

async function pollRelayWork() {
  if (!state.accepted || !state.workerId) return;

  try {
    const res = await fetch(`${state.relayBase}/api/relay/work`, {
      headers: { "x-minikbp-worker": state.workerId },
    });

    if (res.status === 204) return;
    if (!res.ok) return;

    const job = await res.json();
    if (!job?.id || !job?.url || !ALLOWED.test(job.url)) return;

    try {
      const result = await fetchKbp(job.url, {
        method: job.method || "GET",
        headers: job.headers || {},
        body: job.data,
      });

      await fetch(`${state.relayBase}/api/relay/work`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-minikbp-worker": state.workerId,
        },
        body: JSON.stringify({
          id: job.id,
          url: job.url,
          status: result.status,
          headers: result.headers,
          data: result.data,
        }),
      });
    } catch (error) {
      await fetch(`${state.relayBase}/api/relay/work`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-minikbp-worker": state.workerId,
        },
        body: JSON.stringify({ id: job.id, url: job.url, error: String(error) }),
      });
    }
  } catch {
    /* ignore poll errors */
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "minikbp-fetch") {
      if (!ALLOWED.test(message.url)) {
        sendResponse({ error: "URL not allowed" });
        return;
      }
      try {
        const result = await fetchKbp(message.url, {
          method: message.method,
          headers: message.headers,
          body: message.data,
        });
        sendResponse({ result });
      } catch (error) {
        sendResponse({ error: String(error) });
      }
      return;
    }

    if (message?.type === "minikbp-consent") {
      await saveConsent(message.consent);
      sendResponse({ ok: true });
    }
  })();
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "relay-poll") pollRelayWork();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.relayConsent) {
    const c = changes.relayConsent.newValue;
    state.accepted = Boolean(c?.accepted);
    state.workerId = String(c?.workerId || "");
  }
});

loadState().then(() => {
  if (state.accepted) pollRelayWork();
});
