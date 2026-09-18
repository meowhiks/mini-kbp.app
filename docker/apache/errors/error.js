(function () {
  var domainEl = document.getElementById("domain");
  if (domainEl) {
    domainEl.textContent = window.location.hostname || "mini-kbp.site";
  }

  var refreshBtn = document.getElementById("btn-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      window.location.reload();
    });
  }

  var ipBtn = document.getElementById("ip-reveal");
  if (!ipBtn) return;

  ipBtn.addEventListener("click", function () {
    if (ipBtn.disabled) return;
    ipBtn.textContent = "Загрузка…";
    ipBtn.disabled = true;

    fetch("https://cloudflare.com/cdn-cgi/trace", { cache: "no-store" })
      .then(function (res) {
        return res.text();
      })
      .then(function (text) {
        var match = text.match(/^ip=(.+)$/m);
        ipBtn.textContent = match ? match[1].trim() : "не удалось определить";
      })
      .catch(function () {
        ipBtn.textContent = "не удалось определить";
      });
  });
})();
