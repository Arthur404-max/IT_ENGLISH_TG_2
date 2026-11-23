/* IT English Lab — study centre, readiness, plan and mistake notebook */
(() => {
  "use strict";
  const IT = window.IT;
  const { S, esc, icons: I } = IT;
  IT.views = IT.views || {};

  const panelTitle = (title, hint = "") =>
    `<div class="panel-head"><div><h2>${esc(title)}</h2>${hint ? `<p>${esc(hint)}</p>` : ""}</div></div>`;

  const loading = (text = "Считаем готовность…") =>
    `<div class="study-loading"><span class="spinner" aria-hidden="true"></span><p>${esc(text)}</p></div>`;

  const labelForKind = (kind) =>
    ({ review: "Повторение", new: "Новые слова", leech: "Leech-колода", exam: "Ошибки" }[kind] || kind);

  const fmtDate = (value) => {
    if (!value) return "";
    try {
      return new Date(Number(value) * 1000).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    } catch (_) {
      return "";
    }
  };

  const bar = (value, limit, cls = "") => {
    const pct = limit ? Math.max(0, Math.min(100, Math.round((Number(value) / Number(limit)) * 100))) : 0;
    return `<div class="study-meter ${cls}"><div class="progress"><i style="width:${pct}%"></i></div><span>${Number(value) || 0} / ${Number(limit) || 0}</span></div>`;
  };

  const planTask = (task) => {
    const action = task.action === "queue" ? `data-action="start-queue" data-mode="${esc(task.mode)}"` : task.action === "diagnostic" ? `data-action="start-diagnostic"` : "";
    const inner = `<span class="plan-task-dot">${task.kind === "check" ? I.target : task.kind === "audio" ? I.headphones : task.kind === "mistakes" ? I.flag : task.kind === "new" ? I.spark : I.cards}</span>
      <span class="plan-task-copy"><b>${esc(task.title)}</b><small>${esc(task.detail || "")}</small></span>
      <span class="plan-task-min">${Number(task.minutes) || 0} мин</span>`;
    if (task.href) return `<a class="plan-task" href="${esc(task.href)}">${inner}</a>`;
    return `<button class="plan-task" type="button" ${action}>${inner}</button>`;
  };

  const readinessBlock = (r) => {
    const score = Math.max(0, Math.min(100, Number(r.score) || 0));
    const components = (r.components || [])
      .map(
        (c) => `<div class="readiness-component">
          <div class="readiness-component-top"><span>${esc(c.label)}</span><b>${Number(c.value) || 0}</b></div>
          <div class="progress"><i style="width:${Math.max(0, Math.min(100, Number(c.value) || 0))}%"></i></div>
          <small>${esc(c.hint || "")}</small>
        </div>`
      )
      .join("");
    const days = r.days_left;
    const examNote =
      days === null || days === undefined
        ? "Дата экзамена не назначена"
        : days >= 0
          ? `До экзамена ${days} дн.`
          : `Дата экзамена уже прошла (${Math.abs(days)} дн. назад)`;
    return `<section class="study-hero">
      <div class="readiness-ring" style="--score:${score}">
        <div class="readiness-ring-inner"><b>${score}</b><span>из 100</span></div>
      </div>
      <div class="study-hero-copy">
        <span class="eyebrow">READINESS · ${esc(r.band || "старт")}</span>
        <h1>Центр учёбы</h1>
        <p>${esc(r.recommendation || "")}</p>
        <div class="study-hero-meta">
          <span>${I.calendar} ${esc(examNote)}</span>
          <span>${I.flame} ${Number((r.stats || {}).streak) || 0} дней подряд</span>
          <span>${I.brain} ${Number((r.stats || {}).active_vocab) || 0} слов в работе</span>
        </div>
        <div class="study-hero-actions">
          <button class="btn btn-primary" type="button" data-action="start-queue" data-mode="review">${I.play} Начать повторение</button>
          <button class="btn" type="button" data-action="start-diagnostic">${I.target} Диагностика</button>
          <a class="btn btn-ghost" href="#/study/mistakes">${I.flag} Тетрадь ошибок ${r.stats && r.stats.mistakes ? `<span class="badge">${r.stats.mistakes}</span>` : ""}</a>
        </div>
      </div>
      <div class="readiness-components">${components}</div>
    </section>`;
  };

  const queueCounters = (q, p) => {
    const counts = (q && q.counts) || {};
    const used = counts.used || {};
    const prefs = (q && q.prefs) || p || {};
    return `<section class="study-counters">
      <article class="metric-card">
        <span class="metric-label">Повторение</span>
        <b>${Number(counts.review_remaining) || 0}</b>
        ${bar(used.review || 0, prefs.daily_review_limit || 60)}
        <small>${Number(counts.due) || 0} всего к повторению</small>
      </article>
      <article class="metric-card">
        <span class="metric-label">Новые слова</span>
        <b>${Number(counts.new_remaining) || 0}</b>
        ${bar(used.new || 0, prefs.daily_new_limit || 12)}
        <small>${Number(counts.new) || 0} ещё не начаты</small>
      </article>
      <article class="metric-card">
        <span class="metric-label">Leech-колода</span>
        <b>${Number(counts.leech_remaining) || 0}</b>
        ${bar(used.leech || 0, prefs.daily_leech_limit || 15)}
        <small>${Number(counts.leech) || 0} проблемных слов</small>
      </article>
      <article class="metric-card">
        <span class="metric-label">Тетрадь ошибок</span>
        <b>${Number(counts.mistakes) || 0}</b>
        <span class="metric-sub">${Number(counts.exam_remaining) || 0} в сессии</span>
        <small>${counts.used && counts.used.exam_errors ? `${counts.used.exam_errors} назначено сегодня` : "разбор и мини-дриллы"}</small>
      </article>
    </section>`;
  };

  const planBlock = (plan) => {
    if (!plan || !Array.isArray(plan.days) || !plan.days.length) return "";
    const today = plan.days[0];
    const week = plan.days
      .slice(1)
      .map(
        (day) => `<article class="week-day ${day.today ? "is-today" : ""}">
          <div class="week-day-head"><b>${esc(day.weekday)}</b><span>${esc((day.date || "").slice(5))}</span></div>
          <p>${esc(day.focus || "")}</p>
          <div class="week-day-meta">${Number(day.tasks.length) || 0} задачи · ${Number(day.total_minutes) || 0} мин</div>
        </article>`
      )
      .join("");
    return `<div class="study-columns">
      <section class="panel study-plan">
        ${panelTitle("План на сегодня", plan.note || "")}
        <div class="plan-list">${(today.tasks || []).map(planTask).join("") || `<p class="muted">На сегодня задач нет — загляните в аудио или отдохните.</p>`}</div>
        <div class="plan-total">${I.clock} ${Number(today.total_minutes) || 0} минут · готовность ${Number(plan.readiness) || 0}/100</div>
      </section>
      <section class="panel">
        ${panelTitle("Неделя", "План сам пересчитывается после каждого ответа")}
        <div class="week-grid">${week}</div>
      </section>
    </div>`;
  };

  const weakBlock = (r) => {
    const units = (r.weak_units || [])
      .map(
        (u) => `<a class="weak-unit" href="#/unit/${u.id}/vocab">
          <span class="weak-unit-score">${Number(u.score) || 0}</span>
          <span class="weak-unit-copy"><b>${esc(u.title)}</b><small>${esc(u.reason)} · ${Number(u.accuracy) || 0}% точность</small></span>
          ${I.arrow}
        </a>`
      )
      .join("");
    const types = (r.weak_types || [])
      .map(
        (t) => `<div class="weak-type"><span>${esc(t.label)}</span><div class="progress"><i style="width:${Math.max(0, Math.min(100, Number(t.accuracy) || 0))}%"></i></div><b>${Number(t.accuracy) || 0}%</b></div>`
      )
      .join("");
    return `<div class="study-columns">
      <section class="panel">
        ${panelTitle("Слабые юниты", "Сюда стоит вернуться в первую очередь")}
        <div class="weak-units">${units || `<p class="muted">Пока нет данных — начните с очереди или диагностики.</p>`}</div>
      </section>
      <section class="panel">
        ${panelTitle("Типы заданий", "Точность по истории экзаменов")}
        <div class="weak-types">${types || `<p class="muted">Пройдите экзамен, чтобы увидеть слабые типы заданий.</p>`}</div>
      </section>
    </div>`;
  };

  const prefsBlock = (prefs, r) => {
    const p = prefs || {};
    return `<section class="panel study-prefs">
      ${panelTitle("Настройки нагрузки", "Мягкие дневные лимиты и дата реального экзамена.")}
      <form data-form="study-prefs">
        <div class="prefs-grid">
          <label>Новые слова в день<input class="input" type="number" min="0" max="100" name="daily_new_limit" value="${Number(p.daily_new_limit) || 12}"></label>
          <label>Повторения в день<input class="input" type="number" min="0" max="500" name="daily_review_limit" value="${Number(p.daily_review_limit) || 60}"></label>
          <label>Leech в день<input class="input" type="number" min="0" max="100" name="daily_leech_limit" value="${Number(p.daily_leech_limit) || 15}"></label>
          <label>Ошибки за сессию<input class="input" type="number" min="0" max="100" name="daily_exam_limit" value="${Number(p.daily_exam_limit) || 15}"></label>
          <label>Минут в день<input class="input" type="number" min="5" max="180" name="desired_minutes" value="${Number(p.desired_minutes) || 25}"></label>
          <label>Цель по памяти, %<input class="input" type="number" min="80" max="95" step="1" name="desired_retention_pct" value="${Number(p.desired_retention_pct) || 90}"></label>
          <label>Макс. интервал, дней<input class="input" type="number" min="7" max="3650" step="1" name="max_interval_days" value="${Number(p.max_interval_days) || 3650}"></label>
          <label>Дата экзамена<input class="input" type="date" name="exam_date" value="${esc(p.exam_date || "")}"></label>
        </div>
        <p class="prefs-note">FSRS планирует интервалы под выбранную вероятность вспоминания: 90% — баланс, 95% — надёжнее, но повторений больше, 80% — реже. Текущие сроки карточек не переписываются; новые интервалы появятся после ответа.</p>
        <div class="prefs-actions">
          <button class="btn btn-primary" type="submit">Сохранить</button>
          <span class="muted">${r && r.days_left !== null && r.days_left !== undefined ? `До экзамена: ${r.days_left} дн.` : "Дата не задана"}</span>
        </div>
      </form>
    </section>`;
  };

  const overview = (r, plan, queue) => {
    const prefs = (S.progress && S.progress.prefs) || (queue && queue.prefs) || {};
    return `<div class="page study-page">
      <div class="page-head"><div><span class="eyebrow">STUDY CENTRE</span><h1>Учёба без перегрузки</h1><p class="lead">FSRS, дневные лимиты и адаптивный план: система сама решает, что показать дальше.</p></div>
      <button class="btn btn-ghost" type="button" data-action="study-refresh">${I.refresh} Обновить</button></div>
      ${readinessBlock(r)}
      ${queueCounters(queue, prefs)}
      ${planBlock(plan)}
      ${weakBlock(r)}
      ${prefsBlock(prefs, r)}
      <p class="study-footnote">Схема прогресса v3 · FSRS-5 · цель по памяти ${Number(prefs.desired_retention_pct) || 90}% · прогресс хранится локально и работает офлайн. AI не требуется.</p>
    </div>`;
  };

  const drillMarkup = (item, index) => {
    const drill = item.drill || {};
    const state = (S.studyDrills && S.studyDrills[item.id]) || {};
    if (drill.mode === "choice" && Array.isArray(drill.options) && drill.options.length) {
      const options = drill.options
        .map((option, optionIndex) => {
          const picked = Number.isInteger(state.picked) && state.picked === optionIndex;
          const isAnswer = IT.norm(option) === IT.norm(drill.answer);
          const cls = picked ? (isAnswer ? "is-correct" : "is-wrong") : state.picked !== undefined && isAnswer ? "is-correct" : "";
          return `<button class="drill-option ${cls}" type="button" data-action="mistake-option" data-id="${esc(item.id)}" data-index="${optionIndex}" data-correct="${isAnswer ? "1" : "0"}" ${state.picked !== undefined ? "disabled" : ""}>${esc(option)}</button>`;
        })
        .join("");
      const feedback =
        state.picked !== undefined
          ? `<p class="drill-feedback ${state.correct ? "ok" : "bad"}">${state.correct ? "Верно." : `Правильный ответ: ${esc(drill.answer)}`}</p>`
          : "";
      return `<div class="mistake-drill"><span class="mono-label">Мини-дрилл · выбор</span><p>${esc(drill.question)}</p><div class="drill-options">${options}</div>${feedback}<small>${esc(drill.hint || "")}</small></div>`;
    }
    return `<div class="mistake-drill"><span class="mono-label">Мини-дрилл · свободный ответ</span><p>${esc(drill.question || "Сформулируйте ответ по памяти.")}</p>
      <textarea class="textarea" rows="3" placeholder="Ответьте своими словами…" aria-label="Ответ на мини-дрилл"></textarea>
      <button class="btn btn-small" type="button" data-action="mistake-reveal" data-target="drill-answer-${index}">Показать образец</button>
      <div class="drill-answer is-hidden" id="drill-answer-${index}"><b>Образец:</b> ${esc(drill.answer || item.answer || "")}</div>
      <small>${esc(drill.hint || "")}</small></div>`;
  };

  const mistakeCard = (item, index) => {
    const source = [item.unit_title, item.type_label, fmtDate(item.finished_at)].filter(Boolean).join(" · ");
    return `<article class="mistake-card ${item.resolved ? "is-resolved" : ""}">
      <header>
        <div class="mistake-head-copy"><span class="eyebrow">${item.resolved ? "РАЗОБРАНО" : "ОШИБКА"}</span><b>${esc(item.attempt_title || "Экзамен")}</b><small>${esc(source)}</small></div>
        <button class="btn btn-small ${item.resolved ? "" : "btn-ghost"}" type="button" data-action="mistake-resolve" data-id="${esc(item.id)}" data-resolved="${item.resolved ? "0" : "1"}">${item.resolved ? "Вернуть" : "Разобрано"}</button>
      </header>
      <div class="mistake-body">
        <div class="mistake-question">${esc(item.prompt || item.type_label || "Задание")}</div>
        <div class="mistake-answers">
          <span><b>Ваш ответ:</b> ${esc(item.input || "— пропущено —")}</span>
          <span><b>Образец:</b> ${esc(item.answer || "—")}</span>
        </div>
        <div class="mistake-explain"><b>Разбор.</b> ${esc(item.explanation || "")}</div>
        <div class="mistake-example"><b>Пример.</b> ${esc(item.example || "")}</div>
        ${drillMarkup(item, index)}
      </div>
    </article>`;
  };

  const mistakesView = (data) => {
    const filter = S.studyMistakeFilter || "open";
    const items = (data.items || []).filter((item) =>
      filter === "all" ? true : filter === "resolved" ? item.resolved : !item.resolved
    );
    const buttons = [
      ["open", `Открытые (${data.unresolved || 0})`],
      ["resolved", `Разобранные (${data.resolved || 0})`],
      ["all", `Все (${data.total || 0})`],
    ]
      .map(
        ([value, label]) =>
          `<button class="chip ${filter === value ? "active" : ""}" type="button" data-action="study-mistakes-filter" data-filter="${value}">${esc(label)}</button>`
      )
      .join("");
    return `<div class="page study-page">
      <div class="page-head"><div><span class="eyebrow">MISTAKE NOTEBOOK</span><h1>Тетрадь ошибок</h1><p class="lead">Каждая ошибка получает объяснение, пример и мини-дрилл. Правильный ответ в дрилле автоматически закрывает ошибку.</p></div>
      <a class="btn btn-ghost" href="#/study">${I.back} В центр учёбы</a></div>
      <div class="study-tabs">${buttons}<a class="btn btn-small" href="#/exams">${I.target} Новый экзамен</a></div>
      <div class="mistake-list">${items.map(mistakeCard).join("") || `<div class="empty-state"><p>Здесь пока пусто. Ошибки из экзаменов появятся автоматически.</p><a class="btn btn-primary" href="#/exams">Перейти к экзаменам</a></div>`}</div>
    </div>`;
  };

  const render = () => {
    const root = IT.$("#view");
    if (!root) return;
    const mode = S.studyMode || "overview";
    if (S.studyError) {
      root.innerHTML = `<div class="page"><div class="panel error-panel"><b>Не удалось загрузить центр учёбы</b><p>${esc(S.studyError)}</p><button class="btn" type="button" data-action="study-refresh">Повторить</button></div></div>`;
      return;
    }
    if (mode === "mistakes") {
      if (!S.study || !S.study.mistakes) {
        root.innerHTML = loading("Собираем тетрадь ошибок…");
        return;
      }
      root.innerHTML = mistakesView(S.study.mistakes);
      return;
    }
    if (!S.study || !S.study.readiness) {
      root.innerHTML = loading();
      return;
    }
    root.innerHTML = overview(S.study.readiness, S.study.plan, S.study.queue);
  };

  const load = async (mode) => {
    S.studyMode = mode === "mistakes" ? "mistakes" : "overview";
    S.studyError = "";
    render();
    try {
      if (mode === "mistakes") {
        const [mistakes, readiness] = await Promise.all([
          IT.api("/api/mistakes"),
          S.study && S.study.readiness ? Promise.resolve(S.study.readiness) : IT.api("/api/study/readiness"),
        ]);
        S.study = { ...(S.study || {}), mistakes, readiness };
      } else {
        const [readiness, plan, queue] = await Promise.all([
          IT.api("/api/study/readiness"),
          IT.api("/api/study/plan"),
          IT.api("/api/study/queue?kind=review"),
        ]);
        S.study = { ...(S.study || {}), readiness, plan, queue, loadedAt: Date.now() };
      }
    } catch (e) {
      S.studyError = e.message;
    }
    if ((S.studyMode === "mistakes" ? "mistakes" : "overview") === mode) render();
  };

  IT.views.study = (mode = "overview") => {
    load(mode);
  };

  const reload = () => {
    S.study = null;
    if (location.hash.startsWith("#/study")) {
      if (location.hash === "#/study/mistakes") IT.views.study("mistakes");
      else IT.views.study("overview");
    }
  };

  const savePrefs = async (form) => {
    const fd = new FormData(form);
    const body = {};
    for (const key of ["daily_new_limit", "daily_review_limit", "daily_leech_limit", "daily_exam_limit", "desired_minutes", "desired_retention_pct", "max_interval_days"]) {
      body[key] = Number(fd.get(key));
    }
    body.exam_date = String(fd.get("exam_date") || "");
    try {
      const res = await IT.api("/api/study/prefs", { method: "POST", body });
      S.progress.prefs = res.prefs;
      IT.toast("Настройки нагрузки сохранены");
      S.study = null;
      IT.views.study("overview");
    } catch (e) {
      IT.toast(e.message, "error");
    }
  };

  const resolveMistake = async (id, resolved) => {
    try {
      await IT.api("/api/mistakes/resolve", { method: "POST", body: { id, resolved } });
      const bug = S.study && S.study.mistakes;
      if (bug) {
        const item = (bug.items || []).find((entry) => entry.id === id);
        if (item) item.resolved = resolved;
        bug.unresolved = (bug.items || []).filter((entry) => !entry.resolved).length;
        bug.resolved = (bug.items || []).filter((entry) => entry.resolved).length;
      }
      const ids = new Set(S.progress.resolved_mistakes || []);
      if (resolved) ids.add(id);
      else ids.delete(id);
      S.progress.resolved_mistakes = [...ids];
      IT.toast(resolved ? "Ошибка отмечена разобранной" : "Ошибка возвращена в тетрадь");
      render();
    } catch (e) {
      IT.toast(e.message, "error");
    }
  };

  const pickDrillOption = (id, index, correct) => {
    if (!S.studyDrills) S.studyDrills = {};
    if (S.studyDrills[id] && S.studyDrills[id].picked !== undefined) return;
    S.studyDrills[id] = { picked: index, correct: Boolean(correct) };
    render();
    if (correct) {
      setTimeout(() => resolveMistake(id, true), 650);
    }
  };

  const filterMistakes = (filter) => {
    S.studyMistakeFilter = ["open", "resolved", "all"].includes(filter) ? filter : "open";
    render();
  };

  IT.studyActions = {
    reload,
    savePrefs,
    resolveMistake,
    pickDrillOption,
    filterMistakes,
    labelForKind,
  };
})();
