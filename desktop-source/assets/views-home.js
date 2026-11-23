/* IT English Lab — home and materials views */
(() => {
  "use strict";
  const IT = window.IT;
  const { S, esc, icons: I } = IT;

  const unitCard = (u) => {
    const st = IT.unitStats(u.id, u.vocab);
    const badge = st.pct >= 100 ? '<span class="badge ok">Пройден</span>' : st.studied ? `<span class="badge accent">${st.pct}%</span>` : '<span class="badge">Новый</span>';
    const search = `${u.title_en} ${u.title_ru} unit ${u.id}`.toLowerCase();
    return `
      <a class="unit-card" href="#/unit/${u.id}/vocab" data-search="${esc(search)}">
        <div class="unit-card-top">
          <span class="unit-num">UNIT ${String(u.id).padStart(2, "0")}</span>
          ${badge}
        </div>
        <h3 class="unit-title">${esc(u.title_en)}</h3>
        <div class="unit-sub">${esc(u.title_ru)}</div>
        <div class="unit-meta">
          <span>${I.book} ${u.vocab} ${IT.plural(u.vocab, "слово", "слова", "слов")}</span>
          <span>${I.text} ${u.texts} ${IT.plural(u.texts, "текст", "текста", "текстов")}</span>
          <span>${I.tasks} ${u.tasks}</span>
        </div>
        <div class="unit-bottom">
          <div class="unit-bottom-row"><span>${st.learned} из ${u.vocab} закреплено</span><span>${st.pct}%</span></div>
          <div class="progress thin"><i style="width:${st.pct}%"></i></div>
        </div>
        <span class="unit-arrow">${I.arrow}</span>
      </a>`;
  };

  const renderHome = () => {
    const units = S.units || [];
    const p = S.progress;
    const stats = p.stats || { answers: 0, correct: 0, sessions: 0 };
    const learned = Number(p.learned || 0);
    const total = S.totalVocab || units.reduce((n, u) => n + u.vocab, 0);
    const totalTexts = units.reduce((n, u) => n + (u.texts || 0), 0);
    const accuracy = stats.answers ? Math.round((stats.correct / stats.answers) * 100) : 0;
    const streak = Number(p.streak || 0);
    let cont = units.find((u) => IT.unitStats(u.id, u.vocab).pct < 100) || units[0];
    if (!cont) cont = { id: 1, title_en: "The History of Computers", title_ru: "История компьютеров", vocab: 0 };
    const contStats = IT.unitStats(cont.id, cont.vocab);
    const contPct = contStats.pct;
    const activity = p.activity && p.activity.length ? p.activity : Array.from({ length: 30 }, (_, i) => ({ date: "", count: 0 }));
    const maxActivity = Math.max(1, ...activity.map((d) => d.count || 0));
    const today = IT.today();
    const due = Number(today.due || p.due || 0);
    const goals = IT.GOALS;
    const minutes = Math.round(today.ms / 60000);
    const cardsPct = Math.min(100, Math.round((today.answers / goals.cards) * 100));

    const activityBars = activity
      .map((d) => {
        const h = d.count ? Math.max(9, Math.round(((d.count || 0) / maxActivity) * 100)) : 4;
        return `<span class="activity-day" title="${esc(d.date)}: ${d.count}"><i style="height:${h}%;opacity:${d.count ? 0.85 : 0.25}"></i></span>`;
      })
      .join("");

    IT.setView(`
      <section class="home-hero">
        <div class="hero-copy">
          <div class="eyebrow">IT English Lab · 15 юнитов</div>
          <h1 class="display">Английский<br>для <em>IT</em>.<br>По шагам.</h1>
          <p class="lead">Полный курс: лексика, тексты, экзаменационные задания и тренажёр. Офлайн — карточки и упражнения. С ИИ — проверка перевода и живой репетитор.</p>
          <div class="hero-actions">
            <a class="btn btn-primary btn-lg" href="#/unit/${cont.id}/practice">${I.play} Продолжить · Unit ${cont.id}</a>
            <a class="btn btn-lg" href="#/textbook">${I.book} Открыть материалы</a>
          </div>
          <div class="hero-foot">
            <span><i></i> 15 юнитов</span>
            <span><i></i> ${total} ${IT.plural(total, "термин", "термина", "терминов")}</span>
            <span><i></i> ${totalTexts} ${IT.plural(totalTexts, "текст", "текста", "текстов")}</span>
            <span><i></i> прогресс сохраняется</span>
          </div>
        </div>
        <aside class="hero-panel">
          <div class="hero-panel-top">
            <span class="mono-label">Следующий шаг</span>
            <span class="badge accent">Unit ${String(cont.id).padStart(2, "0")}</span>
          </div>
          <h2>${esc(cont.title_ru)}</h2>
          <p>${esc(cont.title_en)}. ${contStats.learned ? "Продолжите закреплять лексику юнита." : "Начните со словаря, затем переходите к тексту и заданиям."}</p>
          <div style="margin-top:auto">
            <div class="progress"><i style="width:${contPct}%"></i></div>
            <div class="hero-stats">
              <div class="hero-stat"><b>${contPct}%</b><span>юнит</span></div>
              <div class="hero-stat"><b>${streak}</b><span>${IT.plural(streak, "день", "дня", "дней")} подряд</span></div>
            </div>
            <a class="btn btn-block btn-sm" style="margin-top:14px" href="#/unit/${cont.id}/practice">Тренировать юнит ${I.arrow}</a>
          </div>
        </aside>
      </section>

      <section class="daily-plan">
        <section class="plan-card review-card">
          <div class="plan-icon">${I.calendar}</div>
          <div class="plan-body">
            <div class="eyebrow">Сегодня к повторению</div>
            <h2>${due ? `${due} ${IT.plural(due, "карточка", "карточки", "карточек")}` : "Очередь пуста"}</h2>
            <p>${due ? "SRS-расписание подобрало слова, которые пора освежить." : "Все карточки на сегодня повторены. Можно взяться за новый юнит."}</p>
          </div>
          <button class="btn btn-primary" type="button" data-action="start-review" ${due ? "" : "disabled"}>${due ? "Начать повторение" : "На сегодня всё"}</button>
        </section>
        <section class="plan-card goals-card">
          <div class="plan-body" style="width:100%">
            <div class="plan-top"><div class="eyebrow">Цель дня</div><a class="tiny" href="#/analytics">Аналитика ${I.arrow}</a></div>
            <div class="goal-row"><span>Карточки</span><b>${today.answers} / ${goals.cards}</b></div>
            <div class="goal-bar"><i style="width:${cardsPct}%"></i></div>
            <div class="goal-chips">
              <span class="${minutes >= goals.minutes ? "ok" : ""}">${I.clock} ${minutes} / ${goals.minutes} мин</span>
              <span class="${today.exams >= goals.exams ? "ok" : ""}">${I.target} ${today.exams} / ${goals.exams} экз.</span>
              <span>${I.calendar} ${due} к повторению</span>
            </div>
          </div>
        </section>
      </section>

      <section class="stats-row">
        <div class="stat-card">
          <div class="stat-card-top"><span class="mono-label">Закреплено</span>${I.layers}</div>
          <div class="stat-value">${learned} <small>/ ${total}</small></div>
          <div class="stat-label">слов уверенно знаете</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-top"><span class="mono-label">Ответов</span>${I.target}</div>
          <div class="stat-value">${stats.answers || 0}</div>
          <div class="stat-label">в упражнениях</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-top"><span class="mono-label">Точность</span>${I.brain}</div>
          <div class="stat-value">${stats.answers ? accuracy : 0}<small>%</small></div>
          <div class="stat-label">правильных ответов</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-top"><span class="mono-label">Серия</span>${I.flame}</div>
          <div class="stat-value">${streak} <small>дн.</small></div>
          <div class="stat-label">занимаетесь подряд</div>
        </div>
      </section>

      <div class="section-head">
        <div>
          <h2 class="section-title">15 юнитов</h2>
          <p class="muted">От истории компьютеров до профессий в IT — вся программа курса.</p>
        </div>
        <a class="btn btn-sm" href="#/textbook">Содержание ${I.arrow}</a>
      </div>
      <div class="unit-grid">${units.map(unitCard).join("")}</div>

      <div class="home-bottom">
        <div class="how-card">
          <div class="eyebrow">Как это работает</div>
          <h2 class="section-title" style="margin-top:12px;font-size:25px">Три шага к уверенному переводу</h2>
          <div class="how-list">
            <div class="how-item"><span class="how-num">01</span><div><b>Разберите юнит</b><span>Словарь, текст A/B и задания курса — всё в одном месте.</span></div></div>
            <div class="how-item"><span class="how-num">02</span><div><b>Закрепите в тренажёре</b><span>Карточки, выбор варианта и набор перевода. Слабые слова возвращаются чаще.</span></div></div>
            <div class="how-item"><span class="how-num">03</span><div><b>Проверьте себя с ИИ</b><span>Подключите ключ API или встроенную GGUF-модель — репетитор разберёт ошибки.</span></div></div>
          </div>
        </div>
        <div class="activity-card">
          <div class="eyebrow">Активность</div>
          <h2 class="section-title" style="margin-top:12px;font-size:25px">30 дней</h2>
          <div class="activity-grid">${activityBars}</div>
          <div class="activity-legend"><span>30 дней назад</span><span>сегодня</span></div>
          <div class="divider" style="margin:18px 0"></div>
          <p class="muted small" style="line-height:1.6">${stats.sessions || 0} ${IT.plural(stats.sessions || 0, "тренировка", "тренировки", "тренировок")} завершено. Серия считается по дням, когда вы отвечали хотя бы на один вопрос.</p>
        </div>
      </div>`);
  };

  const renderTextbook = () => {
    const units = S.units || [];
    IT.setView(`
      <div class="page-head">
        <div class="left">
          <div class="eyebrow">Все материалы</div>
          <h1 class="display" style="font-size:clamp(38px,4.7vw,58px);margin-top:14px">Содержание</h1>
          <p class="lead" style="margin-top:10px">15 юнитов: активная лексика, тексты для чтения и задания. Выберите юнит, чтобы открыть словарь, текст или практику.</p>
        </div>
        <div class="search-wrap" style="max-width:280px">
          ${I.search}
          <input type="search" placeholder="Найти юнит или тему…" data-input="textbook-search" value="${esc(S.textbookQuery || "")}" aria-label="Поиск по юнитам">
        </div>
      </div>
      <div class="unit-grid" id="textbook-list">${units.map(unitCard).join("")}</div>
      <div class="empty" id="textbook-empty" style="display:none;margin-top:16px"><b>Ничего не найдено</b>Попробуйте другое слово — например, «networks» или «безопасность».</div>
      ${IT.finalCheckCallout ? IT.finalCheckCallout() : ""}
    `);
  };

  IT.unitCard = unitCard;
  IT.views = IT.views || {};
  IT.views.home = renderHome;
  IT.views.textbook = renderTextbook;
})();
