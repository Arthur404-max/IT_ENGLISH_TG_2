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

  const meta = document.querySelector('meta[name="telegram-backend-url"]');
  const backendUrl = (meta?.content || "").replace(/\/$/, "");

  let paid = false;
  let overlay = null;
  let statusTimer = null;

  const setOverlay = (visible) => {
    if (!overlay) return;
    overlay.hidden = !visible;
  };

  const checkAccess = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/access/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: tg.initData }),
      });
      if (!response.ok) return false;
      const result = await response.json();
      paid = Boolean(result.paid);
      setOverlay(!paid);
      if (paid && statusTimer) {
        clearInterval(statusTimer);
        statusTimer = null;
      }
      return paid;
    } catch (_) {
      return false;
    }
  };

  const createOverlay = () => {
    overlay = document.createElement("div");
    overlay.className = "tg-paywall";
    overlay.innerHTML = `
      <div class="tg-paywall-card" role="dialog" aria-modal="true" aria-label="Доступ к IT English">
        <div class="tg-paywall-mark">IT</div>
        <h1>Полный доступ</h1>
        <p id="tg-paywall-copy">Оплатите разово 1 Telegram Star для разблокировки материалов на этом аккаунте.</p>
        <button type="button" id="tg-buy-access">${backendUrl ? "Купить за ⭐ 1" : "Сервис оплаты настраивается"}</button>
      </div>`;
    document.body.appendChild(overlay);
    if (!backendUrl) {
      overlay.querySelector("#tg-buy-access").disabled = true;
      return;
    }
    overlay.querySelector("#tg-buy-access").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Открываем оплату…";
      try {
        const response = await fetch(`${backendUrl}/api/access/invoice`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData: tg.initData }),
        });
        if (!response.ok) throw new Error("invoice request failed");
        const { invoiceLink } = await response.json();
        tg.openInvoice(invoiceLink, async (status) => {
          if (status === "paid") {
            statusTimer = setInterval(checkAccess, 1500);
            await checkAccess();
          }
        });
      } catch (_) {
        button.disabled = false;
        button.textContent = "Попробовать снова";
      }
    });
  };

  createOverlay();
  checkAccess();
})();
