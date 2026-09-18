(() => {
  window.__MINIKBP_RELAY__ = { version: "0.1.0" };

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  function relayResponse(id, payload) {
    try {
      window.postMessage({ type: "minikbp-relay-response", id, ...payload }, "*");
    } catch {
      /* page may be unloading */
    }
  }

  function safeSendMessage(message, onResult) {
    if (!extensionAlive()) {
      onResult({ error: "Extension context invalidated" });
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          onResult({ error: err.message });
          return;
        }
        onResult(response);
      });
    } catch (error) {
      onResult({ error: String(error) });
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "minikbp-consent") {
      safeSendMessage({ type: "minikbp-consent", consent: data.consent }, () => {});
      return;
    }

    if (data.type !== "minikbp-relay-request" || !data.id || !data.opts?.url) return;

    safeSendMessage(
      {
        type: "minikbp-fetch",
        url: data.opts.url,
        method: data.opts.method || "GET",
        headers: data.opts.headers || {},
        data: data.opts.data,
      },
      (response) => {
        if (response?.error) {
          relayResponse(data.id, { error: response.error });
          return;
        }
        relayResponse(data.id, { result: response.result });
      }
    );
  });
})();
