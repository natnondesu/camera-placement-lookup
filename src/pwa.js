// Offline support. Inlined into the console's script by generate.mjs. Registers the service worker (public/sw.js),
// says once when the console is saved for offline use, and offers a reload when a new version is ready.

const PWA_TEXT = {
  en: {
    pwUpdate: "A new version of the console is ready.", pwReload: "Reload", pwDismiss: "Dismiss",
    pwOffline: "Saved for offline use: the console now works without a connection."
  },
  th: {
    pwUpdate: "มีโปรแกรมเวอร์ชันใหม่แล้ว", pwReload: "โหลดใหม่", pwDismiss: "ปิด",
    pwOffline: "บันทึกไว้ใช้แบบออฟไลน์แล้ว โปรแกรมใช้งานได้แม้ไม่มีอินเทอร์เน็ต"
  }
};
Object.keys(PWA_TEXT).forEach((code) => Object.assign(I18N[code], PWA_TEXT[code]));

(function startOfflineSupport() {
  if (!("serviceWorker" in navigator) || location.protocol.indexOf("http") !== 0) return;

  const toast = document.createElement("div");
  toast.className = "pwa-toast";
  toast.id = "pwaToast";
  toast.hidden = true;
  toast.setAttribute("role", "status");
  toast.innerHTML = '<span id="pwaText"></span>' +
    '<button type="button" class="pwa-reload" id="pwaReload" data-i18n="pwReload">Reload</button>' +
    '<button type="button" class="pwa-dismiss" id="pwaDismiss" data-i18n-attr="aria-label:pwDismiss">' + SHEET_ICON.close + "</button>";
  document.body.appendChild(toast);
  const text = document.getElementById("pwaText");
  const reload = document.getElementById("pwaReload");
  let waiting = null;
  let reloadRequested = false;
  let hideTimer = 0;

  function show(key, offerReload) {
    window.clearTimeout(hideTimer);
    text.textContent = t(key);
    reload.hidden = !offerReload;
    toast.hidden = false;
    // The offline note is news, not a decision; it goes by itself.
    if (!offerReload) hideTimer = window.setTimeout(() => { toast.hidden = true; }, 6000);
  }

  reload.addEventListener("click", () => {
    if (!waiting) return;
    reloadRequested = true;
    waiting.postMessage("skipWaiting");
  });
  document.getElementById("pwaDismiss").addEventListener("click", () => { toast.hidden = true; });

  // The first install also takes control of the page; only a reload the user asked for may reload it.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadRequested) location.reload();
  });

  window.addEventListener("load", () => {
    const firstInstall = !navigator.serviceWorker.controller;
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      const offer = (worker) => {
        waiting = worker;
        show("pwUpdate", true);
      };
      if (registration.waiting && navigator.serviceWorker.controller) offer(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) offer(worker);
          if (worker.state === "activated" && firstInstall) show("pwOffline", false);
        });
      });
      // A console left open on site checks for a new version whenever it comes back to the screen.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registration.update().catch(() => {});
      });
    }).catch((error) => console.error("Offline support could not start", error));
  });
})();
