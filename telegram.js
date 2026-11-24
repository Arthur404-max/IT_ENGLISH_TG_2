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

  const loadServerAccount = async () => {
    if (!backendUrl || !tg.initData) return;
    try {
      const [streakResponse, referralResponse] = await Promise.all([
        fetch(`${backendUrl}/api/streak/status`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData: tg.initData }),
        }),
        fetch(`${backendUrl}/api/referral/status`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData: tg.initData }),
        }),
      ]);
      if (streakResponse.ok) {
        const result = await streakResponse.json();
        root.dataset.streak = String(result.streak?.current || 0);
      }
      if (referralResponse.ok) {
        const result = await referralResponse.json();
        root.dataset.referralCode = String(result.code || "");
      }
      createProductTools();
    } catch (_) {}
  };

  let blitzSessionId = "";
  let blitzTimer = null;
  let blitzQuestions = [];
  let blitzAnswers = [];
  let blitzIndex = 0;
  let blitzCorrect = 0;

  const finishBlitz = async () => {
    try {
      await fetch(`${backendUrl}/api/blitz/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          initData: tg.initData,
          session_id: blitzSessionId,
          correct: blitzCorrect,
          total: blitzQuestions.length,
        }),
      });
      const card = overlay?.querySelector(".tg-paywall-card");
      if (card) {
        card.innerHTML = `
          <div class="tg-paywall-mark">IT</div>
          <h1>Блиц завершён</h1>
          <p>Результат: ${blitzCorrect} из ${blitzQuestions.length}</p>
          <button type="button" id="tg-blitz-close">Закрыть</button>`;
        card.querySelector("#tg-blitz-close")?.addEventListener("click", () => {
          setOverlay(false);
        });
      }
    } catch (_) {
      IT.toast && IT.toast("Не удалось сохранить блиц", "error");
    }
  };

  const renderBlitzQuestion = () => {
    if (blitzIndex >= blitzQuestions.length) {
      finishBlitz();
      return;
    }
    const card = overlay?.querySelector(".tg-paywall-card");
    if (!card) return;
    const question = blitzQuestions[blitzIndex];
    card.innerHTML = `
      <div class="tg-paywall-mark">IT</div>
      <h1>Блиц · ${blitzIndex + 1}/${blitzQuestions.length}</h1>
      <p><strong>${escapeHtml(question.en)}</strong></p>
      <div class="tg-game-options">
        ${question.options.map((option) =>
          `<button type="button" data-blitz-answer="${escapeHtml(option)}">${escapeHtml(option)}</button>`
        ).join("")}
      </div>`;
    card.querySelectorAll("[data-blitz-answer]").forEach((button) => {
      button.addEventListener("click", () => {
        const answer = button.dataset.blitzAnswer;
        blitzAnswers.push(answer);
        if (answer === question.answer) blitzCorrect++;
        blitzIndex++;
        renderBlitzQuestion();
      });
    });
  };

  const startBlitzRound = async () => {
    try {
      const units = await window.IT.api("/api/units");
      const unitsDetail = await Promise.all((units.units || []).slice(0, 15).map((unit) =>
        window.IT.api(`/api/units/${unit.id}`)));
      const vocabulary = unitsDetail.flatMap((unit) =>
        (unit.vocab || []).map((item) => ({
          en: String(item.en || ""),
          ru: String(item.ru || "").split(",")[0].trim(),
        })));
      const pool = vocabulary.filter((item) => item.en && item.ru);
      blitzQuestions = [...pool]
        .sort(() => Math.random() - 0.5)
        .slice(0, 20)
        .map((item) => {
          const options = [...new Set([
            item.ru,
            ...[...pool].sort(() => Math.random() - 0.5)
              .map((entry) => entry.ru)
              .filter((value) => value !== item.ru),
          ])].slice(0, 4);
          while (options.length < 4) options.push(item.ru);
          return {
            en: item.en,
            answer: item.ru,
            options: options.sort(() => Math.random() - 0.5),
          };
        });
      blitzAnswers = [];
      blitzIndex = 0;
      blitzCorrect = 0;
      renderBlitzQuestion();
    } catch (_) {
      IT.toast && IT.toast("Не удалось загрузить блиц", "error");
    }
  };

  const showLeaderboard = async () => {
    const card = overlay?.querySelector(".tg-paywall-card");
    if (!card) {
      const tools = document.querySelector(".tg-product-tools");
      tools?.remove();
      const modal = document.createElement("div");
      modal.className = "tg-paywall";
      modal.innerHTML = '<div class="tg-paywall-card"><div class="tg-paywall-mark">IT</div><h1>Рейтинг</h1><p>Загрузка…</p></div>';
      document.body.appendChild(modal);
    }
    try {
      const response = await fetch(`${backendUrl}/api/leaderboard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: tg.initData, limit: 10 }),
      });
      if (!response.ok) throw new Error("leaderboard unavailable");
      const result = await response.json();
      const target = overlay?.querySelector(".tg-paywall-card") ||
        document.querySelector(".tg-paywall-card");
      if (!target) return;
      target.innerHTML = `
        <div class="tg-paywall-mark">IT</div>
        <h1>Рейтинг блица</h1>
        ${result.entries.length
          ? result.entries.map((entry) =>
              `<p>${entry.rank}. ${entry.accuracy >= 0 ? "Игрок " : ""}${escapeHtml(entry.user_id)} — ${entry.score} очков</p>`).join("")
          : "<p>Пока нет результатов.</p>"}`;
    } catch (_) {
      const target = overlay?.querySelector(".tg-paywall-card") ||
        document.querySelector(".tg-paywall-card");
      if (target) target.innerHTML = '<div class="tg-paywall-mark">IT</div><h1>Рейтинг недоступен</h1>';
    }
  };

  const startBlitz = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/blitz/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: tg.initData }),
      });
      if (!response.ok) throw new Error("blitz unavailable");
      const result = await response.json();
      blitzSessionId = result.session_id;
      const remaining = Math.max(0, result.expires_at - Date.now());
      const card = overlay?.querySelector(".tg-paywall-card");
      if (card) {
        card.innerHTML = `
          <div class="tg-paywall-mark">IT</div>
          <h1>Блиц 5 минут</h1>
          <p>Сессия готова. Вопросов в блице: 20.</p>
          <p id="tg-blitz-timer">${Math.ceil(remaining / 1000)} сек.</p>
          <button type="button" id="tg-blitz-start-round">Начать</button>`;
        card.querySelector("#tg-blitz-start-round")?.addEventListener("click", startBlitzRound);
      }
      if (remaining > 0) {
        clearInterval(blitzTimer);
        blitzTimer = setInterval(() => {
          const timer = document.getElementById("tg-blitz-timer");
          if (!timer) return;
          const left = Math.max(0, Math.ceil((result.expires_at - Date.now()) / 1000));
          timer.textContent = `${left} сек.`;
          if (left <= 0) clearInterval(blitzTimer);
        }, 1000);
      }
    } catch (_) {
      IT.toast && IT.toast("Не удалось запустить блиц", "error");
    }
  };

  const createProductTools = () => {
    if (document.querySelector(".tg-product-tools")) return;
    const tools = document.createElement("div");
    tools.className = "tg-product-tools";
    tools.innerHTML = `
      <button type="button" id="tg-start-blitz">Блиц 5 минут</button>
      <button type="button" id="tg-leaderboard">Рейтинг</button>
      <button type="button" id="tg-level">Уровень B1</button>
      <button type="button" id="tg-certificate">Сертификат</button>
      <button type="button" id="tg-voice">Голос</button>`;
    document.body.appendChild(tools);
    tools.querySelector("#tg-start-blitz").addEventListener("click", startBlitz);
    tools.querySelector("#tg-leaderboard").addEventListener("click", showLeaderboard);
    tools.querySelector("#tg-level").addEventListener("click", async () => {
      await fetch(`${backendUrl}/api/account/level`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: tg.initData, level: "B1" }),
      });
      IT.toast && IT.toast("Уровень установлен: B1");
    });
    tools.querySelector("#tg-certificate").addEventListener("click", async () => {
      const response = await fetch(`${backendUrl}/api/certificate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: tg.initData, title: "IT English — course result" }),
      });
      if (response.ok) {
        const result = await response.json();
        IT.toast && IT.toast(`Сертификат: ${result.certificate.id}`);
      }
    });
    tools.querySelector("#tg-voice").addEventListener("click", async () => {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        IT.toast && IT.toast("Запись голоса недоступна в этом браузере", "error");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        const chunks = [];
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size) chunks.push(event.data);
        });
        recorder.addEventListener("stop", () => {
          stream.getTracks().forEach((track) => track.stop());
          IT.toast && IT.toast("Запись завершена. Speech score model будет подключена отдельно.");
        });
        recorder.start();
        setTimeout(() => recorder.state !== "inactive" && recorder.stop(), 4000);
      } catch (_) {
        IT.toast && IT.toast("Разрешите доступ к микрофону", "error");
      }
    });
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
        await loadServerAccount();
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
