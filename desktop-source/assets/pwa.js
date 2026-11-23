/* IT English Lab — PWA registration and install prompt */
(() => {
  "use strict";
  const IT = (window.IT = window.IT || {});
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    document.documentElement.classList.add("pwa-installable");
    IT.onInstallAvailable && IT.onInstallAvailable();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    document.documentElement.classList.remove("pwa-installable");
    IT.toast && IT.toast("Приложение установлено");
  });

  IT.pwaCanInstall = () => Boolean(deferredPrompt);
  IT.installPwa = async () => {
    if (!deferredPrompt) {
      IT.toast &&
        IT.toast(
          "Установка недоступна в этом браузере. Откройте меню браузера и выберите «Установить приложение».",
          "info"
        );
      return;
    }
    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();
    try {
      await prompt.userChoice;
    } catch (e) {
      /* user dismissed */
    }
    document.documentElement.classList.remove("pwa-installable");
  };

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("Service worker:", error);
      });
    });
  }
})();
