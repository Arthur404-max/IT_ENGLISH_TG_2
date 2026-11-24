(() => {
  "use strict";

  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg) return;

  const root = document.documentElement;
  root.classList.add("telegram-mini-app");
  root.classList.add("tg-paywall-active");
  root.classList.add("tg-gated");
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
  let gameNonce = "";
  let gameQuestions = [];
  let gameAnswers = [];
  let gameIndex = 0;

  const syncProgressToServer = async () => {
    if (!backendUrl || !tg.initData) return;
    try {
      const snapshot = window.IT && window.IT.staticDebug && window.IT.staticDebug.snapshot;
      if (!snapshot) return;
      await fetch(`${backendUrl}/api/profile/progress/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          initData: tg.initData,
          progress: snapshot().progress,
        }),
      });
    } catch (_) {}
  };

  const restoreServerProgress = async () => {
    if (!backendUrl || !tg.initData) return;
    try {
      const response = await fetch(`${backendUrl}/api/profile/progress`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: tg.initData }),
      });
      if (!response.ok) return;
      const result = await response.json();
      if (!result.progress) return;
      const staticDebug = window.IT && window.IT.staticDebug;
      if (staticDebug && typeof window.localStorage === "object") {
        try {
          localStorage.setItem(
            "itelab-static-state-v1",
            JSON.stringify({ progress: result.progress, backups: [] })
          );
          location.reload();
        } catch (_) {}
      }
    } catch (_) {}
  };

  const setOverlay = (visible) => {
    if (!overlay) return;
    overlay.hidden = !visible;
    root.classList.toggle("tg-paywall-active", visible);
    root.classList.toggle("tg-gated", visible);
    if (!visible) {
      root.classList.remove("tg-gated");
      root.classList.remove("tg-paywall-active");
    }
  };

  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  const renderGameQuestion = () => {
    const card = overlay.querySelector(".tg-paywall-card");
    if (!card) return;
    const question = gameQuestions[gameIndex];
    const progress = ((gameIndex + 1) / gameQuestions.length) * 100;
    card.innerHTML = `
      <div class="tg-paywall-mark">IT</div>
      <h1>IT Vocabulary Sprint</h1>
    <p>Повторение слабых слов · вопрос ${gameIndex + 1} из ${gameQuestions.length}</p>
      <div class="tg-game-progress"><i style="width:${progress}%"></i></div>
      <p><strong>${escapeHtml(question.en)}</strong></p>
      <div class="tg-game-options">
        ${question.options.map((option) => `
          <button type="button" data-game-answer="${escapeHtml(option)}">${escapeHtml(option)}</button>
        `).join("")}
      </div>`;
    card.querySelectorAll("[data-game-answer]").forEach((button) => {
      button.addEventListener("click", () => {
        gameAnswers.push(button.dataset.gameAnswer);
        gameIndex++;
        if (gameIndex < gameQuestions.length) {
          renderGameQuestion();
        } else {
          submitGame();
        }
      });
    });
  };

  const submitGame = async () => {
    const card = overlay.querySelector(".tg-paywall-card");
    if (card) {
      card.innerHTML = '<div class="tg-paywall-mark">IT</div><h1>Проверяем результат…</h1>';
    }
    try {
      const response = await fetch(`${backendUrl}/api/access/game/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          initData: tg.initData,
          nonce: gameNonce,
          answers: gameAnswers,
        }),
      });
      if (!response.ok) throw new Error("game submit failed");
      const result = await response.json();
      if (Array.isArray(result.review) && window.IT && window.IT.api) {
        await Promise.all(result.review.map((item) =>
          window.IT.api("/api/answer", {
            method: "POST",
            body: {
              unit_id: item.unitId,
              en: item.en,
              correct: item.correct,
              rating: item.correct ? 3 : 1,
              response_ms: 5000,
            },
          }),
        ));
        await window.IT.api("/api/session", {
          method: "POST",
          body: { correct: result.correct, total: result.total },
        });
      }
      if (card) {
        card.innerHTML = `
          <div class="tg-paywall-mark">IT</div>
          <h1>${result.passed ? "Доступ открыт!" : "Попробуйте ещё раз"}</h1>
          <p>Результат: ${result.correct} из ${result.total}. Нужно минимум 8 верных ответов.</p>
          <button type="button" id="tg-game-result">${result.passed ? "Начать учёбу" : "Повторить игру"}</button>`;
        card.querySelector("#tg-game-result").addEventListener("click", () => {
          if (result.passed) {
            checkAccess();
          } else {
            startGame();
          }
        });
      }
    } catch (_) {
      if (card) {
        card.innerHTML = '<div class="tg-paywall-mark">IT</div><h1>Не удалось отправить результат</h1><p>Проверьте соединение и попробуйте снова.</p><button type="button" id="tg-game-retry">Повторить</button>';
        card.querySelector("#tg-game-retry").addEventListener("click", startGame);
      }
    }
  };

  const startGame = async () => {
    if (!backendUrl) return;
    const card = overlay?.querySelector(".tg-paywall-card");
    if (card) card.innerHTML = '<div class="tg-paywall-mark">IT</div><h1>Готовим вопросы…</h1>';
    let progressSnapshot = null;
    try {
      const snapshot = window.IT && window.IT.staticDebug && window.IT.staticDebug.snapshot;
      progressSnapshot = snapshot ? snapshot().progress : null;
    } catch (_) {}
    try {
      const response = await fetch(`${backendUrl}/api/access/game/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: tg.initData, progress: progressSnapshot }),
      });
      if (!response.ok) throw new Error("game start failed");
      const result = await response.json();
      if (result.alreadyUnlocked) {
        checkAccess();
        return;
      }
      gameNonce = result.nonce;
      gameQuestions = result.questions;
      gameAnswers = [];
      gameIndex = 0;
      renderGameQuestion();
    } catch (_) {
      if (card) {
        card.innerHTML = '<div class="tg-paywall-mark">IT</div><h1>Не удалось запустить игру</h1><p>Проверьте сервер оплаты и интернет-соединение.</p>';
      }
    }
  };

  const checkAccess = async () => {
    try {
      if (!tg.initData) {
        setOverlay(true);
        return false;
      }
      const response = await fetch(`${backendUrl}/api/access/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: tg.initData }),
      });
      if (!response.ok) return false;
      const result = await response.json();
      paid = Boolean(result.paid || result.free);
      setOverlay(!paid);
      if (paid) {
        root.classList.remove("tg-gated");
        root.classList.remove("tg-paywall-active");
        await restoreServerProgress();
        await syncProgressToServer();
      }
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
    overlay = document.getElementById("tg-access-gate");
    if (!overlay) return;
    const buy = overlay.querySelector("#tg-buy-access");
    const game = overlay.querySelector("#tg-play-game");
    const copy = overlay.querySelector("#tg-paywall-copy");
    if (copy) copy.textContent = "Оплатите разово 1 Telegram Star или пройдите бесплатную игру.";
    if (buy) buy.disabled = !backendUrl;
    if (buy) buy.textContent = backendUrl ? "Купить за ⭐ 1" : "Сервис оплаты настраивается";
    if (game) game.disabled = !backendUrl;
    if (!backendUrl) {
      overlay.querySelector("#tg-buy-access").disabled = true;
      return;
    }
    overlay.querySelector("#tg-play-game")?.addEventListener("click", startGame);
    overlay.querySelector("#tg-buy-access")?.addEventListener("click", async (event) => {
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
  (async () => {
    const hasAccess = await checkAccess();
    if (hasAccess) return;
    if (new URLSearchParams(location.search).get("free_game") === "1") {
      startGame();
    }
  })();
})();
