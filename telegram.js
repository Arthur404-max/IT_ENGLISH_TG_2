(() => {
  "use strict";

  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg) return;

  const root = document.documentElement;
  root.classList.add("telegram-mini-app");
  tg.ready();
  tg.expand();

  const dark = tg.colorScheme !== "light";
  root.classList.toggle("tg-light", !dark);
  root.classList.toggle("tg-dark", dark);

  try {
    tg.setHeaderColor(dark ? "#0b0f0e" : "#ffffff");
    tg.setBackgroundColor(dark ? "#0b0f0e" : "#ffffff");
  } catch (_) {}

  const updateBackButton = () => {
    const route = (location.hash || "#/home").replace(/^#/, "");
    if (route === "/home" || route === "/") {
      tg.BackButton.hide();
    } else {
      tg.BackButton.show();
    }
  };

  tg.BackButton.onClick(() => {
    const route = (location.hash || "#/home").replace(/^#/, "");
    if (route === "/home" || route === "/") {
      tg.close();
    } else if (history.length > 1) {
      history.back();
    } else {
      location.hash = "#/home";
    }
  });

  window.addEventListener("hashchange", updateBackButton);
  updateBackButton();
  root.dataset.tgPlatform = tg.platform || "";
})();
