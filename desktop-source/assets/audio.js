/* IT English Lab — local audio library with listening tasks */
(() => {
  "use strict";
  const IT = window.IT;
  const { S, esc, icons: I } = IT;
  IT.views = IT.views || {};

  const fmtDuration = (seconds) => {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };

  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9а-яё\s']/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

  const numberWord = (value) => {
    const map = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten" };
    const clean = normalize(value);
    return map[clean] || clean;
  };

  const matches = (input, answer) => {
    const a = numberWord(answer);
    const b = numberWord(input);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length > 8 && (a.includes(b) || b.includes(a))) return true;
    const expected = new Set(a.split(" ").filter((word) => word.length > 2 && !["the", "and", "for", "with", "that", "from", "into", "are", "its"].includes(word)));
    const actual = new Set(b.split(" ").filter(Boolean));
    if (!expected.size) return false;
    let overlap = 0;
    for (const word of expected) if (actual.has(word)) overlap++;
    return overlap / expected.size >= 0.65;
  };

  const state = () => {
    if (!S.audio) S.audio = { items: [], activeId: "", answers: {}, done: [], transcript: {}, error: "", loading: true };
    return S.audio;
  };

  const activeItem = () => {
    const a = state();
    return (a.items || []).find((item) => item.id === a.activeId) || null;
  };

  const doneIds = () => {
    const fromProgress = (S.progress && S.progress.audio_done) || [];
    return new Set([...(state().done || []), ...fromProgress]);
  };

  const taskCard = (item, task, index) => {
    const a = state();
    const stored = (a.answers[item.id] && a.answers[item.id][index]) || {};
    const feedback = stored.checked
      ? `<p class="audio-feedback ${stored.correct ? "ok" : "bad"}">${stored.correct ? "Верно." : `Пока не то. Ориентир: ${esc(task.answer)}`}</p>`
      : "";
    return `<div class="audio-task" data-audio-task="${index}">
      <span class="mono-label">Вопрос ${index + 1}</span>
      <p>${esc(task.question)}</p>
      <div class="audio-task-row">
        <input class="input" type="text" data-input="audio-answer" data-id="${esc(item.id)}" data-index="${index}" value="${esc(stored.value || "")}" placeholder="Ответ на английском…" autocomplete="off">
        <button class="btn btn-small" type="button" data-action="audio-check" data-id="${esc(item.id)}" data-index="${index}">Проверить</button>
      </div>
      ${feedback}
      ${task.hint ? `<details class="audio-hint"><summary>Подсказка</summary><p>${esc(task.hint)}</p></details>` : ""}
    </div>`;
  };

  const detail = (item) => {
    const a = state();
    const done = doneIds().has(item.id);
    const transcriptOpen = Boolean(a.transcript[item.id]);
    const tasks = (item.tasks || []).map((task, index) => taskCard(item, task, index)).join("");
    return `<article class="audio-detail">
      <div class="audio-detail-head">
        <div>
          <span class="eyebrow">${esc(item.source || "LOCAL AUDIO")} · ${esc(item.level || "B1")}</span>
          <h2>${esc(item.title)}</h2>
          <p>${esc(item.title_ru || "")}</p>
        </div>
        <button class="icon-btn" type="button" data-action="audio-close" aria-label="Закрыть материал">${I.x}</button>
      </div>
      <div class="audio-player-wrap">
        <audio id="audio-player" controls preload="metadata" src="/audio/${encodeURIComponent(item.file)}">
          Ваш браузер не поддерживает аудио. <a href="/audio/${encodeURIComponent(item.file)}">Скачать WAV</a>.
        </audio>
        <div class="audio-player-tools">
          <span>${I.clock} ${fmtDuration(item.duration_sec)}</span>
          <button class="chip" type="button" data-action="audio-rate" data-rate="0.85">0.85×</button>
          <button class="chip active" type="button" data-action="audio-rate" data-rate="1">1×</button>
          <button class="chip" type="button" data-action="audio-rate" data-rate="1.15">1.15×</button>
          <button class="chip" type="button" data-action="audio-rewind" data-seconds="-5">−5 с</button>
          <button class="chip" type="button" data-action="audio-rewind" data-seconds="5">+5 с</button>
        </div>
      </div>
      <p class="audio-summary">${esc(item.summary_ru || "")}</p>
      <section class="audio-tasks">
        <div class="panel-head"><h3>Задания</h3><span class="badge">${(item.tasks || []).length}</span></div>
        ${tasks || `<p class="muted">К этому материалу пока нет заданий.</p>`}
      </section>
      <div class="audio-detail-foot">
        <button class="btn" type="button" data-action="audio-transcript" data-id="${esc(item.id)}" aria-expanded="${transcriptOpen ? "true" : "false"}">${I.text} ${transcriptOpen ? "Скрыть транскрипт" : "Показать транскрипт"}</button>
        <button class="btn ${done ? "" : "btn-primary"}" type="button" data-action="audio-done" data-id="${esc(item.id)}" data-done="${done ? "0" : "1"}">${done ? `${I.check} Прослушано` : "Отметить прослушанным"}</button>
      </div>
      <div class="audio-transcript ${transcriptOpen ? "" : "is-hidden"}" data-audio-transcript="${esc(item.id)}"><p>${esc(item.transcript || "")}</p></div>
    </article>`;
  };

  const card = (item) => {
    const done = doneIds().has(item.id);
    return `<article class="audio-card ${done ? "is-done" : ""}">
      <div class="audio-card-icon">${I.headphones}</div>
      <div class="audio-card-copy">
        <span class="eyebrow">${esc(item.source || "")} ${done ? "· ПРОСЛУШАНО" : ""}</span>
        <h2>${esc(item.title)}</h2>
        <p>${esc(item.summary_ru || "")}</p>
        <div class="audio-meta"><span>${I.clock} ${fmtDuration(item.duration_sec)}</span><span>${esc(item.level || "B1")}</span><span>${(item.tasks || []).length} заданий</span></div>
      </div>
      <button class="btn ${done ? "" : "btn-primary"}" type="button" data-action="audio-open" data-id="${esc(item.id)}">${done ? "Повторить" : "Слушать"} ${I.arrow}</button>
    </article>`;
  };

  const render = () => {
    const root = IT.$("#view");
    if (!root) return;
    const a = state();
    if (a.error) {
      root.innerHTML = `<div class="page"><div class="panel error-panel"><b>Аудиобиблиотека не загрузилась</b><p>${esc(a.error)}</p><button class="btn" type="button" data-action="audio-reload">Повторить</button></div></div>`;
      return;
    }
    if (a.loading) {
      root.innerHTML = `<div class="study-loading"><span class="spinner" aria-hidden="true"></span><p>Загружаем аудиоматериалы…</p></div>`;
      return;
    }
    const items = a.items || [];
    const current = activeItem();
    const done = doneIds();
    root.innerHTML = `<div class="page audio-page">
      <div class="page-head"><div><span class="eyebrow">LISTENING LIBRARY</span><h1>Аудио</h1><p class="lead">Локальные записи с заданиями: работают офлайн, без внешних сервисов. Транскрипт можно открыть после прослушивания.</p></div><a class="btn btn-ghost" href="#/study">${I.back} Центр учёбы</a></div>
      ${current ? detail(current) : ""}
      <div class="audio-progress-line"><span>${done.size} из ${items.length} материалов прослушано</span><div class="progress"><i style="width:${items.length ? Math.round((done.size / items.length) * 100) : 0}%"></i></div></div>
      <section class="audio-grid">${items.map(card).join("") || `<div class="empty-state"><p>Аудиоматериалы не найдены.</p></div>`}</section>
      <p class="study-footnote">WAV-файлы записаны локально (Windows SAPI, en-US). Озвучка браузера остаётся резервом для остальных текстов.</p>
    </div>`;
  };

  const load = async () => {
    const a = state();
    a.loading = true;
    a.error = "";
    render();
    try {
      const data = await IT.api("/api/audio");
      a.items = data.items || [];
      a.done = data.done || [];
      a.loading = false;
      if (!a.activeId && a.items.length) a.activeId = "";
    } catch (e) {
      a.loading = false;
      a.error = e.message;
    }
    render();
  };

  IT.views.audio = () => {
    load();
  };

  const open = (id) => {
    const a = state();
    a.activeId = id;
    render();
    const detailEl = IT.$(".audio-detail");
    if (detailEl) detailEl.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const check = (id, index) => {
    const a = state();
    const item = (a.items || []).find((entry) => entry.id === id);
    const task = item && (item.tasks || [])[index];
    if (!task) return;
    const input = IT.$(`[data-input="audio-answer"][data-id="${CSS.escape(id)}"][data-index="${index}"]`);
    const value = input ? input.value : ((a.answers[id] || {})[index] || {}).value || "";
    if (!a.answers[id]) a.answers[id] = {};
    const correct = matches(value, task.answer);
    a.answers[id][index] = { value, correct, checked: true };
    const card = input && input.closest("[data-audio-task]");
    if (card) {
      let feedback = card.querySelector(".audio-feedback");
      if (!feedback) {
        feedback = document.createElement("p");
        feedback.className = "audio-feedback";
        const row = card.querySelector(".audio-task-row");
        if (row) row.insertAdjacentElement("afterend", feedback);
      }
      feedback.className = `audio-feedback ${correct ? "ok" : "bad"}`;
      feedback.textContent = correct ? "Верно." : `Пока не то. Ориентир: ${task.answer}`;
    }
    if (correct) IT.toast("Верно");
  };

  const markDone = async (id, done) => {
    try {
      const res = await IT.api("/api/audio/done", { method: "POST", body: { id, done } });
      const a = state();
      a.done = res.done || [];
      S.progress.audio_done = a.done;
      IT.toast(done ? "Материал отмечен прослушанным" : "Отметка снята");
      render();
    } catch (e) {
      IT.toast(e.message, "error");
    }
  };

  const toggleTranscript = (id) => {
    const a = state();
    a.transcript[id] = !a.transcript[id];
    const box = IT.$(`[data-audio-transcript="${CSS.escape(id)}"]`);
    if (box) box.classList.toggle("is-hidden", !a.transcript[id]);
    const btn = IT.$(`[data-action="audio-transcript"][data-id="${CSS.escape(id)}"]`);
    if (btn) {
      btn.setAttribute("aria-expanded", String(Boolean(a.transcript[id])));
      btn.innerHTML = `${I.text} ${a.transcript[id] ? "Скрыть транскрипт" : "Показать транскрипт"}`;
    }
  };

  const rate = (value) => {
    const player = IT.$("#audio-player");
    if (!player) return;
    player.playbackRate = Math.max(0.5, Math.min(2, Number(value) || 1));
    IT.$$("[data-action='audio-rate']").forEach((btn) => btn.classList.toggle("active", Number(btn.dataset.rate) === player.playbackRate));
  };

  const rewind = (seconds) => {
    const player = IT.$("#audio-player");
    if (!player) return;
    player.currentTime = Math.max(0, Math.min(player.duration || Infinity, player.currentTime + Number(seconds || 0)));
  };

  IT.audioActions = { open, check, markDone, toggleTranscript, rate, rewind, reload: load };
})();
